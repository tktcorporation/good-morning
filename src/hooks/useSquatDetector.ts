import { Accelerometer } from 'expo-sensors';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * スクワット検出の内部フェーズ。
 *
 * idle → dipped（しゃがむディップを検出）→ peaked（立ち上がりピーク = 1 回カウント）
 * → cooldown（静止に戻るまで待機）→ idle
 *
 * 端末の向きに依存しないよう、3 軸合成加速度（magnitude）の 1g 静止基準からの
 * 振幅変化で判定する。
 *
 * ⚠️ expo-sensors の Accelerometer は重力加速度を **g 単位**（静止時 |a| ≈ 1.0）で
 *    返す。旧実装は m/s² 前提で 9.0/10.5 という閾値を使っていたため、
 *    g 単位では決して到達せずカウントが一切増えないバグがあった。
 */
export type SquatPhase = 'idle' | 'dipped' | 'peaked' | 'cooldown';

/**
 * しゃがむ動作の判定閾値（g）。1.0 から 0.15g 以上ディップしたら下降と判定。
 * 軽い姿勢調整やセンサーノイズでは下回らず、しっかりしゃがめば確実に下回る値。
 */
const DIP_THRESHOLD = 0.85;
/**
 * 立ち上がりの判定閾値（g）。1.0 から 0.20g 以上のピークで上昇と判定。
 * 立ち上がりの押し出し加速で発生する典型的なピーク（1.2–1.6g）を捉える。
 */
const PEAK_THRESHOLD = 1.2;
/** cooldown から idle に戻る判定の静止帯（g）。 */
const REST_BAND_LOW = 0.9;
const REST_BAND_HIGH = 1.1;

/**
 * 各フェーズの最小滞在時間（ms）。瞬間的なノイズで閾値を跨いだだけでは
 * 次フェーズに進ませないための保険。スクワット動作は 1 秒オーダーなので
 * 100ms 程度のフィルタはほぼ感度を損なわない。
 */
const MIN_DIP_MS = 120;
const MIN_PEAK_MS = 80;
const MIN_REST_MS = 150;

/**
 * 直前のカウントから次のカウントまでの最小間隔（ms）。
 * 人間のスクワット 1 回は最速でも 0.7 秒程度。これより短い間隔で発火したら
 * 振動・端末の取り回しによる連続誤検出と判断して捨てる。
 */
const DEBOUNCE_MS = 700;

/**
 * dip → peak がこの時間内に完了しなければ idle にリセット（ms）。
 * しゃがんだまま止まる、途中で別動作を挟む、といった中断ケースの救済。
 */
const PHASE_TIMEOUT_MS = 4000;

/**
 * 低域通過フィルタ（指数移動平均）の係数。0..1 で値が小さいほど平滑化が強い。
 * スクワット帯域（~1Hz）は通しつつ、サンプリング由来の高周波ノイズを抑える。
 */
const SMOOTHING_ALPHA = 0.4;

/**
 * 加速度センサーのサンプリング間隔（ms）。
 * 100ms から 80ms に短縮して、素早いスクワットでもピーク・ディップを
 * 取りこぼさないようにしている（バッテリー影響は無視できる範囲）。
 */
const SAMPLING_INTERVAL_MS = 80;

export interface DetectorState {
  phase: SquatPhase;
  phaseEnteredAt: number;
  smoothed: number;
  lastCountedAt: number;
}

const INITIAL_STATE: DetectorState = {
  phase: 'idle',
  phaseEnteredAt: 0,
  smoothed: 1.0,
  // 初回カウントが debounce で弾かれないよう、十分に古い時刻として扱う。
  lastCountedAt: Number.NEGATIVE_INFINITY,
};

interface StepContext {
  readonly state: DetectorState;
  readonly smoothed: number;
  readonly now: number;
  readonly phaseAge: number;
  readonly enter: (phase: SquatPhase) => DetectorState;
  readonly stay: DetectorState;
}

type StepResult = { state: DetectorState; counted: boolean };

function stepIdle(ctx: StepContext): StepResult {
  if (ctx.smoothed < DIP_THRESHOLD) {
    return { state: ctx.enter('dipped'), counted: false };
  }
  return { state: ctx.stay, counted: false };
}

function stepDipped(ctx: StepContext): StepResult {
  if (ctx.phaseAge > PHASE_TIMEOUT_MS) {
    return { state: ctx.enter('idle'), counted: false };
  }
  if (ctx.smoothed > PEAK_THRESHOLD && ctx.phaseAge >= MIN_DIP_MS) {
    return { state: ctx.enter('peaked'), counted: false };
  }
  return { state: ctx.stay, counted: false };
}

function stepPeaked(ctx: StepContext): StepResult {
  if (ctx.phaseAge < MIN_PEAK_MS) {
    return { state: ctx.stay, counted: false };
  }
  // sustained-peak 条件: MIN_PEAK_MS 経過時点で signal がまだピーク帯に
  // 残っていることを要求する。経過時間だけで count してしまうと、
  // 1 サンプル分のスパイクで peaked に入り、その直後に rest に戻っても
  // count されてしまい、端末の jolt 系ノイズで誤検出が起きうる。
  // 注意: EMA(α=0.4) の慣性で本物のスクワットなら次サンプル時点でも
  // smoothed は PEAK_THRESHOLD 以上に残るため、quick squat も取りこぼさない。
  if (ctx.smoothed < PEAK_THRESHOLD) {
    return { state: ctx.enter('idle'), counted: false };
  }
  const cooldown = ctx.enter('cooldown');
  if (ctx.now - ctx.state.lastCountedAt >= DEBOUNCE_MS) {
    return {
      state: { ...cooldown, lastCountedAt: ctx.now },
      counted: true,
    };
  }
  return { state: cooldown, counted: false };
}

function stepCooldown(ctx: StepContext): StepResult {
  if (
    ctx.smoothed >= REST_BAND_LOW &&
    ctx.smoothed <= REST_BAND_HIGH &&
    ctx.phaseAge >= MIN_REST_MS
  ) {
    return { state: ctx.enter('idle'), counted: false };
  }
  return { state: ctx.stay, counted: false };
}

const PHASE_HANDLERS: Record<SquatPhase, (ctx: StepContext) => StepResult> = {
  idle: stepIdle,
  dipped: stepDipped,
  peaked: stepPeaked,
  cooldown: stepCooldown,
};

/**
 * 1 サンプル分の状態遷移を計算する純粋関数。
 *
 * 切り出している理由: useEffect 内のリスナーを薄く保ち、ロジックをユニット
 * テストしやすくするため。生の加速度ではなく EMA で平滑化した magnitude を
 * 渡す前提（呼び出し側でフィルタリングする）。
 *
 * 各フェーズの遷移は step{Phase} 関数群に委譲して、本関数は dispatcher として
 * 振る舞う。各 step 関数は純粋で、cognitive complexity を分散させる目的。
 *
 * @returns 次の状態と、このサンプルでカウントすべきかのフラグ。
 */
export function stepDetector(state: DetectorState, smoothed: number, now: number): StepResult {
  const ctx: StepContext = {
    state,
    smoothed,
    now,
    phaseAge: now - state.phaseEnteredAt,
    enter: (phase) => ({ ...state, phase, phaseEnteredAt: now, smoothed }),
    stay: { ...state, smoothed },
  };
  return PHASE_HANDLERS[state.phase](ctx);
}

/**
 * スクワット動作を加速度センサーで検出するカスタムフック。
 *
 * 背景: 朝の起床確認タスクとして、寝ぼけたまま操作できないフィジカルチャレンジを提供する。
 * チェックボックスをタップするだけの従来タスクと違い、実際に体を動かす必要がある。
 *
 * @param enabled - true でセンサー購読を開始。false で停止（バッテリー節約）。
 * @param targetCount - 目標スクワット回数。達したら onComplete を呼ぶ。
 * @param onSquat - スクワット 1 回検出時のコールバック。
 * @param onComplete - 目標回数達成時のコールバック。
 */
export function useSquatDetector(
  enabled: boolean,
  targetCount: number,
  onSquat: () => void,
  onComplete: () => void,
) {
  const [count, setCount] = useState(0);
  const [isListening, setIsListening] = useState(false);

  const stateRef = useRef<DetectorState>(INITIAL_STATE);
  const countRef = useRef(count);
  countRef.current = count;
  /**
   * targetCount をミラーする ref。
   *
   * targetCount を useEffect の依存に入れると、呼び出し側が
   * `targetCount = required - current` のように動的な値を渡している場合
   * （例: SquatChallengeItem）、カウントが 1 回進むたびに effect が再実行され、
   * stateRef がまっさらに初期化されて lastCountedAt（debounce 履歴）が消える。
   * 結果、連続した動作が DEBOUNCE_MS を無視して二重カウントされうる。
   *
   * リスナー内では「現在の最新閾値」が分かれば良く、購読を作り直す必要は無い。
   * ref で参照することで effect の再実行を防ぐ。
   */
  const targetCountRef = useRef(targetCount);
  targetCountRef.current = targetCount;

  const handleComplete = useCallback(onComplete, [onComplete]);
  const handleSquat = useCallback(onSquat, [onSquat]);

  useEffect(() => {
    if (!enabled) {
      setIsListening(false);
      return;
    }

    Accelerometer.setUpdateInterval(SAMPLING_INTERVAL_MS);
    // センサー購読開始時はクリーンな初期状態に戻す。
    // enable トグル直後に古い phase が残っていると、最初の数サンプルで
    // 誤カウントが起きうる。
    stateRef.current = { ...INITIAL_STATE, phaseEnteredAt: Date.now() };

    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      const raw = Math.sqrt(x * x + y * y + z * z);
      const smoothed = SMOOTHING_ALPHA * raw + (1 - SMOOTHING_ALPHA) * stateRef.current.smoothed;
      const now = Date.now();
      const result = stepDetector(stateRef.current, smoothed, now);
      stateRef.current = result.state;

      if (result.counted) {
        const newCount = countRef.current + 1;
        setCount(newCount);
        handleSquat();
        if (newCount >= targetCountRef.current) {
          handleComplete();
        }
      }
    });

    setIsListening(true);

    return () => {
      subscription.remove();
      setIsListening(false);
    };
    // targetCount は意図的に依存から外している（targetCountRef 経由で参照）。
    // 詳細は targetCountRef の定義コメント参照。
  }, [enabled, handleSquat, handleComplete]);

  const reset = useCallback(() => {
    setCount(0);
    stateRef.current = { ...INITIAL_STATE, phaseEnteredAt: Date.now() };
  }, []);

  return { count, isListening, reset };
}
