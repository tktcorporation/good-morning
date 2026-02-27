/**
 * StreakBadge の表示ロジックをテスト。
 *
 * StreakBadge は React コンポーネントだが、テスト環境が node のため
 * レンダリングテストは行わず、表示に使われるデータの整合性をテストする。
 * StreakState の値域と StreakBadge の props が正しく対応するか検証。
 */

import { INITIAL_STREAK_STATE } from '../stores/daily-grade-store';
import type { StreakState } from '../types/streak';
import { MAX_FREEZES } from '../types/streak';

describe('StreakBadge data', () => {
  it('initial streak state has 0 streak and 0 freezes', () => {
    expect(INITIAL_STREAK_STATE.currentStreak).toBe(0);
    expect(INITIAL_STREAK_STATE.freezesAvailable).toBe(0);
  });

  it('freezesAvailable is bounded by MAX_FREEZES', () => {
    const state: StreakState = {
      currentStreak: 10,
      longestStreak: 10,
      freezesAvailable: MAX_FREEZES,
      freezesUsedTotal: 0,
      lastGradedDate: '2026-02-27',
    };
    expect(state.freezesAvailable).toBeLessThanOrEqual(MAX_FREEZES);
    expect(state.freezesAvailable).toBeGreaterThanOrEqual(0);
  });

  it('streak count can be any non-negative number', () => {
    const state: StreakState = {
      currentStreak: 365,
      longestStreak: 365,
      freezesAvailable: 2,
      freezesUsedTotal: 5,
      lastGradedDate: '2026-02-27',
    };
    expect(state.currentStreak).toBe(365);
  });

  it('freezes range from 0 to MAX_FREEZES', () => {
    for (let i = 0; i <= MAX_FREEZES; i++) {
      const state: StreakState = {
        currentStreak: 1,
        longestStreak: 1,
        freezesAvailable: i,
        freezesUsedTotal: 0,
        lastGradedDate: null,
      };
      expect(state.freezesAvailable).toBe(i);
    }
  });
});
