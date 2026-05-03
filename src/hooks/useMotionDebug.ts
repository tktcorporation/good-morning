import { Accelerometer, Barometer, Gyroscope, Magnetometer, Pedometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { nextSquatPhase, type SquatPhase } from './useSquatDetector';

// biome-ignore lint/suspicious/noConsole: debug-screen hook needs visible failures for triage
const logWarn = console.warn;

/**
 * デバッグ画面（app/squat-check.tsx）でリアルタイムにモーション情報を可視化するためのフック。
 *
 * 背景: スクワット検出の感度や閾値を調整したい場合、また「他にどんな動きが取れそうか」を
 * 把握したい場合のために、端末で取得できるモーション関連データをまとめて返す。
 * 本番フロー（useSquatDetector）とは別に独立購読しており、本番ロジックには影響しない。
 *
 * 各センサーは利用不可（シミュレータ・対応していない端末）の場合は null を返す。
 * Pedometer は権限要求が必要なため `permissionGranted` で結果を表す。
 *
 * NOTE: このフックは毎サンプル setState を呼ぶため再描画コストが高い。
 * デバッグ画面以外では絶対に使わないこと（本番では useSquatDetector を使う）。
 *
 * @param enabled - false 時は購読しない（画面遷移後のリーク防止）
 */
export interface MotionDebugSample {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface AccelerometerDebugSample extends MotionDebugSample {
  readonly magnitude: number;
}

export interface BarometerDebugSample {
  /** hPa */
  readonly pressure: number;
  /** 海抜からの相対高度 (m)。iOS のみ取得可能。 */
  readonly relativeAltitude: number | null;
}

export type SensorAvailability = 'unknown' | 'available' | 'unavailable';

export interface PedometerDebugState {
  /** Pedometer ハードウェアが端末で利用可能か */
  readonly availability: SensorAvailability;
  /** モーション権限の状態。null = 未要求 */
  readonly permissionGranted: boolean | null;
  /** 監視開始からカウントしている歩数 */
  readonly stepsSinceWatchStart: number;
  /** 今日 0:00 から現在までの累計歩数（HealthKit 由来） */
  readonly stepsToday: number | null;
  /** Pedometer 利用時のエラーメッセージ */
  readonly error: string | null;
}

export interface MotionDebugState {
  readonly accelerometer: AccelerometerDebugSample | null;
  readonly accelerometerAvailable: SensorAvailability;
  readonly gyroscope: MotionDebugSample | null;
  readonly gyroscopeAvailable: SensorAvailability;
  readonly magnetometer: MotionDebugSample | null;
  readonly magnetometerAvailable: SensorAvailability;
  readonly barometer: BarometerDebugSample | null;
  readonly barometerAvailable: SensorAvailability;
  readonly pedometer: PedometerDebugState;
  /** スクワット判定のステートマシン現在状態（リアルタイム） */
  readonly squatPhase: SquatPhase;
  /** 直近に観測された magnitude のうちの極小値（しゃがみ深さの目安） */
  readonly minMagnitude: number | null;
  /** 直近に観測された magnitude の極大値（立ち上がり強度の目安） */
  readonly maxMagnitude: number | null;
}

/**
 * デバッグ画面のサンプリング間隔。100ms は本番の useSquatDetector と同じ値。
 * これより短くしてもセンサー側の上限に当たるため意味がない。
 */
const SAMPLE_INTERVAL_MS = 100;

/**
 * Pedometer の今日の歩数を取得する。
 *
 * 失敗原因はシミュレータ・iOS の 7 days クエリ制限・ユーザー権限拒否・
 * ネイティブブリッジの breaking change など多岐にわたる。デバッグ画面では
 * 「— と表示されている理由」が分からないと切り分けが困難なため、エラー時は
 * メッセージを返して呼び出し元で `pedometer.error` に反映する。
 */
async function fetchTodaySteps(): Promise<{
  readonly steps: number | null;
  readonly error: string | null;
}> {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    const result = await Pedometer.getStepCountAsync(start, end);
    return { steps: result.steps, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logWarn('[useMotionDebug] fetchTodaySteps failed:', message);
    return { steps: null, error: message };
  }
}

/**
 * 単純センサー（Accelerometer/Gyroscope/Magnetometer/Barometer）の購読共通処理。
 *
 * 各センサーで try/catch・isAvailable・setUpdateInterval・addListener を繰り返し書くと
 * 認知的複雑度が高くなるため、共通フローをここに集約している。Pedometer は API が
 * 異なる（権限要求や watchStepCount）ため対象外。
 *
 * @returns 購読 subscription（unsubscribe 用）。利用不可・例外時は null。
 */
interface SimpleSensor<T> {
  isAvailableAsync(): Promise<boolean>;
  setUpdateInterval(ms: number): void;
  addListener(cb: (e: T) => void): { remove(): void };
}

async function subscribeSimpleSensor<T>(
  sensor: SimpleSensor<T>,
  intervalMs: number,
  setAvailability: (a: SensorAvailability) => void,
  onSample: (e: T) => void,
  isCancelled: () => boolean,
  // 例外発生時のログ識別用。'available → unavailable' に潰されると native link 不備や
  // expo-sensors の breaking change が見えなくなるため、最低限 console.warn は出す。
  sensorLabel: string,
): Promise<{ remove(): void } | null> {
  try {
    const ok = await sensor.isAvailableAsync();
    if (isCancelled()) return null;
    setAvailability(ok ? 'available' : 'unavailable');
    if (!ok) return null;
    sensor.setUpdateInterval(intervalMs);
    return sensor.addListener(onSample);
  } catch (e) {
    if (!isCancelled()) setAvailability('unavailable');
    logWarn(`[useMotionDebug] ${sensorLabel} subscription failed:`, e);
    return null;
  }
}

/**
 * Barometer サンプルを内部表現に変換する純粋関数。
 *
 * relativeAltitude は iOS のみで返ってくる optional プロパティ。
 * undefined を null に正規化して、UI 側の表示判定をシンプルにする。
 */
function buildBarometerSample(data: {
  readonly pressure: number;
  readonly relativeAltitude?: number;
}): BarometerDebugSample {
  return {
    pressure: data.pressure,
    relativeAltitude: typeof data.relativeAltitude === 'number' ? data.relativeAltitude : null,
  };
}

/**
 * Accelerometer のサンプル毎に呼び出す純粋ステート遷移計算。
 *
 * setupAccelerometer 内に書くと cognitive complexity が高くなりすぎる
 * （リスナーは I/O 副作用 + ステートマシン更新 + min/max 計算が混ざる）ため、
 * 「次にどう状態を変えるか」だけを返すロジックをここに切り出している。
 * `null` を返すフィールドは「変化なし → setState 不要」を意味する。
 */
function computeAccelerometerUpdate(
  prevPhase: SquatPhase,
  prevMin: number | null,
  prevMax: number | null,
  magnitude: number,
): {
  readonly nextPhase: SquatPhase | null;
  readonly nextMin: number | null;
  readonly nextMax: number | null;
} {
  const phaseResult = nextSquatPhase(prevPhase, magnitude);
  const phaseAfterCount = phaseResult === 'counted' ? 'standing' : phaseResult;
  return {
    nextPhase: phaseAfterCount === prevPhase ? null : phaseAfterCount,
    nextMin: prevMin === null || magnitude < prevMin ? magnitude : null,
    nextMax: prevMax === null || magnitude > prevMax ? magnitude : null,
  };
}

export function useMotionDebug(enabled: boolean): MotionDebugState {
  const [accelerometer, setAccelerometer] = useState<AccelerometerDebugSample | null>(null);
  const [accelerometerAvailable, setAccelerometerAvailable] =
    useState<SensorAvailability>('unknown');
  const [gyroscope, setGyroscope] = useState<MotionDebugSample | null>(null);
  const [gyroscopeAvailable, setGyroscopeAvailable] = useState<SensorAvailability>('unknown');
  const [magnetometer, setMagnetometer] = useState<MotionDebugSample | null>(null);
  const [magnetometerAvailable, setMagnetometerAvailable] = useState<SensorAvailability>('unknown');
  const [barometer, setBarometer] = useState<BarometerDebugSample | null>(null);
  const [barometerAvailable, setBarometerAvailable] = useState<SensorAvailability>('unknown');
  const [pedometer, setPedometer] = useState<PedometerDebugState>({
    availability: 'unknown',
    permissionGranted: null,
    stepsSinceWatchStart: 0,
    stepsToday: null,
    error: null,
  });
  const [squatPhase, setSquatPhase] = useState<SquatPhase>('standing');
  const [minMagnitude, setMinMagnitude] = useState<number | null>(null);
  const [maxMagnitude, setMaxMagnitude] = useState<number | null>(null);

  // フェーズはサンプル毎に参照するため ref に保持して再描画を抑える
  const phaseRef = useRef<SquatPhase>('standing');
  const minRef = useRef<number | null>(null);
  const maxRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    // enabled が false→true に切り替わると effect が再実行されるが、ref は
    // hook インスタンスをまたいで保持される。前回セッションの phase/min/max が
    // 残ったまま新しいサンプルを処理すると、最初の入力で偽の遷移が起きる
    // （例: 前回が rising のままだと最初のサンプルで即 counted）。
    // フェーズ/min/max を初期値に戻して新セッションを始める。
    phaseRef.current = 'standing';
    minRef.current = null;
    maxRef.current = null;
    setSquatPhase('standing');
    setMinMagnitude(null);
    setMaxMagnitude(null);

    let cancelled = false;

    const subscriptions: Array<{ remove: () => void }> = [];

    const handleAccelerometerSample = ({ x, y, z }: { x: number; y: number; z: number }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      setAccelerometer({ x, y, z, magnitude });

      const update = computeAccelerometerUpdate(
        phaseRef.current,
        minRef.current,
        maxRef.current,
        magnitude,
      );
      if (update.nextPhase !== null) {
        phaseRef.current = update.nextPhase;
        setSquatPhase(update.nextPhase);
      }
      if (update.nextMin !== null) {
        minRef.current = update.nextMin;
        setMinMagnitude(update.nextMin);
      }
      if (update.nextMax !== null) {
        maxRef.current = update.nextMax;
        setMaxMagnitude(update.nextMax);
      }
    };

    const isCancelled = () => cancelled;

    const setupAll = async () => {
      const subs = await Promise.all([
        subscribeSimpleSensor(
          Accelerometer,
          SAMPLE_INTERVAL_MS,
          setAccelerometerAvailable,
          handleAccelerometerSample,
          isCancelled,
          'Accelerometer',
        ),
        subscribeSimpleSensor(
          Gyroscope,
          SAMPLE_INTERVAL_MS,
          setGyroscopeAvailable,
          setGyroscope,
          isCancelled,
          'Gyroscope',
        ),
        subscribeSimpleSensor(
          Magnetometer,
          SAMPLE_INTERVAL_MS,
          setMagnetometerAvailable,
          setMagnetometer,
          isCancelled,
          'Magnetometer',
        ),
        // 気圧変化は緩やかなので 500ms で十分
        subscribeSimpleSensor(
          Barometer,
          500,
          setBarometerAvailable,
          (data) => setBarometer(buildBarometerSample(data)),
          isCancelled,
          'Barometer',
        ),
      ]);
      // Promise.all を await している間に unmount されたケース（codex P2 指摘）。
      // この時点では useEffect cleanup が既に走り終わっており、ここで push すると
      // 永久にリスナーが残ってしまう。cancelled ならその場で remove して捨てる。
      if (cancelled) {
        for (const sub of subs) sub?.remove();
        return;
      }
      for (const sub of subs) {
        if (sub !== null) subscriptions.push(sub);
      }
    };

    const startPedometerWatch = async () => {
      // 今日の累計歩数（HealthKit 由来）。失敗しても致命的ではないが、
      // 失敗原因をデバッグ画面で見えるようにエラーは pedometer.error に反映する。
      const today = await fetchTodaySteps();
      if (cancelled) return;
      setPedometer((p) => ({
        ...p,
        stepsToday: today.steps,
        // 既存 error（例えば watch 中に出た）を today 取得失敗で上書きしない
        error: today.error ?? p.error,
      }));

      // watchStepCount はリスナー API。同じく Promise.all 後の race と同様、
      // この行に来た時点で cancelled なら remove して捨てる。
      const sub = Pedometer.watchStepCount((result) => {
        setPedometer((p) => ({ ...p, stepsSinceWatchStart: result.steps }));
      });
      if (cancelled) {
        sub.remove();
        return;
      }
      subscriptions.push(sub);
    };

    /**
     * Pedometer の権限要求 → 状態反映 → watch 開始までの 1 連の処理。
     * 利用可能な前提で呼ばれる（呼び出し元で isAvailableAsync 済み）。
     */
    const requestAndStartPedometer = async () => {
      const perm = await Pedometer.requestPermissionsAsync();
      if (cancelled) return;
      setPedometer((p) => ({
        ...p,
        availability: 'available',
        permissionGranted: perm.granted,
      }));
      if (perm.granted) await startPedometerWatch();
    };

    const setupPedometer = async () => {
      try {
        const available = await Pedometer.isAvailableAsync();
        if (cancelled) return;
        if (!available) {
          setPedometer((p) => ({ ...p, availability: 'unavailable' }));
          return;
        }
        await requestAndStartPedometer();
      } catch (e) {
        logWarn('[useMotionDebug] setupPedometer failed:', e);
        if (cancelled) return;
        setPedometer((p) => ({
          ...p,
          availability: 'unavailable',
          error: e instanceof Error ? e.message : String(e),
        }));
      }
    };

    // 各 setup 関数は内部で try/catch しているが、想定外の throw（型エラー・
    // Promise.all の例外伝播・state setter の throw 等）が unhandled rejection に
    // ならないよう .catch を付けて防衛する。
    setupAll().catch((e) => logWarn('[useMotionDebug] setupAll unexpected:', e));
    setupPedometer().catch((e) => logWarn('[useMotionDebug] setupPedometer unexpected:', e));

    return () => {
      cancelled = true;
      for (const sub of subscriptions) sub.remove();
    };
  }, [enabled]);

  return {
    accelerometer,
    accelerometerAvailable,
    gyroscope,
    gyroscopeAvailable,
    magnetometer,
    magnetometerAvailable,
    barometer,
    barometerAvailable,
    pedometer,
    squatPhase,
    minMagnitude,
    maxMagnitude,
  };
}
