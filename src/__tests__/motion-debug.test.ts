/**
 * useMotionDebug の純粋ロジック単体テスト。
 *
 * 背景: フック本体は センサー副作用と setState の塊で jest 環境では再現が難しい。
 * 一方、状態遷移の計算自体は純粋関数として切り出してあるので、ここではその
 * ロジックだけを検証する。
 *
 * 対象:
 *  - nextSquatPhase: スクワット判定の状態遷移（本番フローと共有する純粋関数）
 *  - SQUAT_THRESHOLDS: 閾値定数の値が想定通りか（デバッグ画面の表示で参照される）
 */

import { nextSquatPhase, SQUAT_THRESHOLDS, type SquatPhase } from '../hooks/useSquatDetector';

describe('SQUAT_THRESHOLDS', () => {
  it('しゃがみ → 立ち上がり → 立位の順で閾値が並んでいる', () => {
    // 物理的に意味がある順序: しゃがむと magnitude が下がり、
    // 立ち上がると上がり、最後に元の安静値（≈9.8）に戻る
    expect(SQUAT_THRESHOLDS.DESCEND_THRESHOLD).toBeLessThan(SQUAT_THRESHOLDS.STANDING_THRESHOLD);
    expect(SQUAT_THRESHOLDS.STANDING_THRESHOLD).toBeLessThan(SQUAT_THRESHOLDS.RISE_THRESHOLD);
  });

  it('デバウンス間隔は最低 500ms 以上（人間のスクワットは 1 秒以上かかる）', () => {
    expect(SQUAT_THRESHOLDS.DEBOUNCE_MS).toBeGreaterThanOrEqual(500);
  });
});

describe('nextSquatPhase', () => {
  const { DESCEND_THRESHOLD, RISE_THRESHOLD, STANDING_THRESHOLD } = SQUAT_THRESHOLDS;

  it('standing 状態で magnitude が DESCEND_THRESHOLD を下回ると descending に遷移', () => {
    expect(nextSquatPhase('standing', DESCEND_THRESHOLD - 0.1)).toBe('descending');
  });

  it('standing 状態で magnitude が DESCEND_THRESHOLD 以上なら遷移しない', () => {
    expect(nextSquatPhase('standing', DESCEND_THRESHOLD)).toBe('standing');
    expect(nextSquatPhase('standing', 9.8)).toBe('standing');
  });

  it('descending 状態で magnitude が RISE_THRESHOLD を超えると rising に遷移', () => {
    expect(nextSquatPhase('descending', RISE_THRESHOLD + 0.1)).toBe('rising');
  });

  it('rising 状態で magnitude が STANDING_THRESHOLD を下回ると counted（1回完了）', () => {
    expect(nextSquatPhase('rising', STANDING_THRESHOLD - 0.1)).toBe('counted');
  });

  it('スクワット 1 回の完全なシーケンスを再現できる', () => {
    let phase: SquatPhase = 'standing';
    const samples = [9.8, 8.5, 8.0, 9.0, 10.8, 11.0, 9.4];
    const transitions: Array<SquatPhase | 'counted'> = [];
    for (const m of samples) {
      const next = nextSquatPhase(phase, m);
      transitions.push(next);
      if (next !== 'counted') phase = next;
    }
    // 最後に counted（1 回完了）が現れる
    expect(transitions).toContain('counted');
    expect(transitions[transitions.length - 1]).toBe('counted');
  });
});
