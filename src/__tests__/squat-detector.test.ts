import { type DetectorState, stepDetector } from '../hooks/useSquatDetector';

/**
 * useSquatDetector の純粋関数 stepDetector に対するユニットテスト。
 *
 * 目的: 加速度のサンプル列を流したときに、典型的なスクワット動作だけを
 * 確実にカウントし、ノイズ・歩行・スリープ中の微振動などでは
 * カウントしないことを担保する。
 *
 * 旧実装は g 単位 vs m/s² の単位ミスで一切カウントできない壊れ方をしていた。
 * その回帰を防ぐ役目も兼ねる。
 */

const RESTING_MAGNITUDE = 1.0;

function makeState(overrides: Partial<DetectorState> = {}): DetectorState {
  return {
    phase: 'idle',
    phaseEnteredAt: 0,
    smoothed: RESTING_MAGNITUDE,
    // 初期化直後の状態を再現したい場面が多いので、本番と同じ -∞ を既定値にする。
    lastCountedAt: Number.NEGATIVE_INFINITY,
    ...overrides,
  };
}

/**
 * サンプル列を流して、最終 state と総カウント数を返すヘルパー。
 * 各サンプルは [magnitude, timeMs] のタプル。
 */
function runSamples(
  initial: DetectorState,
  samples: ReadonlyArray<readonly [number, number]>,
): { state: DetectorState; counted: number } {
  let state = initial;
  let counted = 0;
  for (const [m, t] of samples) {
    const r = stepDetector(state, m, t);
    state = r.state;
    if (r.counted) counted += 1;
  }
  return { state, counted };
}

describe('stepDetector — 単発フェーズ遷移', () => {
  test('idle: 静止時は idle のまま', () => {
    const r = stepDetector(makeState(), 1.0, 100);
    expect(r.state.phase).toBe('idle');
    expect(r.counted).toBe(false);
  });

  test('idle → dipped: ディップ閾値を下回ったら下降フェーズへ', () => {
    const r = stepDetector(makeState(), 0.7, 100);
    expect(r.state.phase).toBe('dipped');
    expect(r.state.phaseEnteredAt).toBe(100);
  });

  test('dipped: MIN_DIP_MS 経過前のピークは無視（ノイズ抑止）', () => {
    const s = makeState({ phase: 'dipped', phaseEnteredAt: 100 });
    // 50ms しか経っていないので peaked に進まない
    const r = stepDetector(s, 1.5, 150);
    expect(r.state.phase).toBe('dipped');
  });

  test('dipped → peaked: MIN_DIP_MS 経過後にピーク閾値を超えたら上昇フェーズへ', () => {
    const s = makeState({ phase: 'dipped', phaseEnteredAt: 100 });
    const r = stepDetector(s, 1.5, 300);
    expect(r.state.phase).toBe('peaked');
  });

  test('dipped: PHASE_TIMEOUT_MS を超えたら idle へリセット', () => {
    const s = makeState({ phase: 'dipped', phaseEnteredAt: 0 });
    const r = stepDetector(s, 0.9, 5000);
    expect(r.state.phase).toBe('idle');
  });

  test('peaked: MIN_PEAK_MS 経過前はカウントせず stay', () => {
    const s = makeState({ phase: 'peaked', phaseEnteredAt: 1000 });
    const r = stepDetector(s, 1.4, 1030);
    expect(r.counted).toBe(false);
    expect(r.state.phase).toBe('peaked');
  });

  test('peaked → cooldown: MIN_PEAK_MS 経過後に 1 回カウントして cooldown へ', () => {
    const s = makeState({ phase: 'peaked', phaseEnteredAt: 1000, lastCountedAt: 0 });
    const r = stepDetector(s, 1.4, 1100);
    expect(r.counted).toBe(true);
    expect(r.state.phase).toBe('cooldown');
    expect(r.state.lastCountedAt).toBe(1100);
  });

  test('peaked: debounce 中は cooldown には進むがカウントしない', () => {
    const s = makeState({
      phase: 'peaked',
      phaseEnteredAt: 1000,
      lastCountedAt: 800, // 直近で counted。debounce 700ms 未満。
    });
    const r = stepDetector(s, 1.4, 1100);
    expect(r.counted).toBe(false);
    expect(r.state.phase).toBe('cooldown');
    expect(r.state.lastCountedAt).toBe(800); // 更新されない
  });

  test('cooldown → idle: 静止帯に MIN_REST_MS 以上居続けたら idle へ', () => {
    const s = makeState({ phase: 'cooldown', phaseEnteredAt: 2000 });
    const r = stepDetector(s, 1.0, 2200);
    expect(r.state.phase).toBe('idle');
  });

  test('cooldown: 静止帯外では idle へ戻らない', () => {
    const s = makeState({ phase: 'cooldown', phaseEnteredAt: 2000 });
    const r = stepDetector(s, 1.3, 2400);
    expect(r.state.phase).toBe('cooldown');
  });
});

describe('stepDetector — シナリオ', () => {
  test('典型的なスクワット 1 回でちょうど 1 カウント', () => {
    // 100ms 間隔のサンプル列。idle → dip → peak → rest を踏む。
    const { counted, state } = runSamples(makeState(), [
      [1.0, 0],
      [1.0, 100],
      [0.7, 200], // dip 開始
      [0.7, 300],
      [0.8, 400], // dip 継続（MIN_DIP_MS 達成）
      [1.4, 500], // peak 検出
      [1.4, 600], // MIN_PEAK_MS 達成 → count
      [1.0, 700], // cooldown
      [1.0, 850], // MIN_REST_MS 達成 → idle
      [1.0, 1000],
    ]);
    expect(counted).toBe(1);
    expect(state.phase).toBe('idle');
  });

  test('連続 3 回のスクワットで 3 カウント', () => {
    const samples: Array<[number, number]> = [];
    let t = 0;
    const push = (m: number, dt: number) => {
      t += dt;
      samples.push([m, t]);
    };
    for (let i = 0; i < 3; i++) {
      // 1 サイクルあたり ~1100ms（debounce 700ms より長い）
      push(1.0, 0);
      push(0.7, 100);
      push(0.7, 100);
      push(0.8, 100);
      push(1.4, 100);
      push(1.4, 100);
      push(1.0, 100);
      push(1.0, 200);
      push(1.0, 300);
    }
    const { counted } = runSamples(makeState(), samples);
    expect(counted).toBe(3);
  });

  test('debounce より短い間隔で連射されてもカウントは進まない', () => {
    // peaked のまま振動が続いても 1 カウントしか入らない（cooldown に進む）。
    // dip → peak → count → 即 dip → peak が短時間で来ても debounce で弾かれる。
    const samples: Array<[number, number]> = [
      [1.0, 0],
      [0.7, 100],
      [0.7, 250], // dipped 確定
      [1.4, 350], // peak
      [1.4, 450], // count #1 (lastCountedAt = 450)
      [1.0, 500],
      [1.0, 700], // cooldown → idle
      [0.7, 800],
      [0.7, 950], // dipped 確定
      [1.4, 1050], // peak
      [1.4, 1100], // peaked 中。1100 - 450 = 650 < 700 → debounce
    ];
    const { counted } = runSamples(makeState(), samples);
    expect(counted).toBe(1);
  });

  test('微小ノイズ（端末の小さな揺れ）ではカウントされない', () => {
    const samples: Array<[number, number]> = [];
    for (let i = 0; i < 100; i++) {
      // 0.92 〜 1.08 の振幅。DIP_THRESHOLD(0.85) も PEAK_THRESHOLD(1.2) も超えない。
      const m = 1.0 + 0.08 * Math.sin(i / 3);
      samples.push([m, i * 80]);
    }
    const { counted } = runSamples(makeState(), samples);
    expect(counted).toBe(0);
  });

  test('ディップだけでピークに達しない動作（しゃがんだまま止まる）はカウントされない', () => {
    const samples: Array<[number, number]> = [
      [1.0, 0],
      [0.7, 100],
      [0.7, 300],
      [0.7, 600],
      [0.9, 900],
      [0.95, 1200],
      [1.0, 1500],
    ];
    const { counted } = runSamples(makeState(), samples);
    expect(counted).toBe(0);
  });

  test('PHASE_TIMEOUT_MS を超えてしゃがみっぱなしでも復帰できる', () => {
    const samples: Array<[number, number]> = [
      [1.0, 0],
      [0.7, 100], // dipped
      [0.8, 4500], // タイムアウトで idle へ
      [1.0, 4600],
      // ここから普通のスクワット
      [0.7, 5000],
      [0.7, 5200],
      [1.4, 5400],
      [1.4, 5500],
      [1.0, 5600],
      [1.0, 5800],
    ];
    const { counted } = runSamples(makeState(), samples);
    expect(counted).toBe(1);
  });
});
