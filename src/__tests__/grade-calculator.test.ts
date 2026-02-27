import {
  applyGradeToStreak,
  calculateDailyGrade,
  evaluateBedtime,
  isMorningPass,
} from '../services/grade-calculator';
import type { StreakState } from '../types/streak';
import { MAX_FREEZES } from '../types/streak';

describe('isMorningPass', () => {
  it('returns true for "great"', () => {
    expect(isMorningPass('great')).toBe(true);
  });

  it('returns true for "ok"', () => {
    expect(isMorningPass('ok')).toBe(true);
  });

  it('returns false for "late"', () => {
    expect(isMorningPass('late')).toBe(false);
  });

  it('returns false for "missed"', () => {
    expect(isMorningPass('missed')).toBe(false);
  });
});

describe('evaluateBedtime', () => {
  it('returns "noData" when actualBedtime is null', () => {
    expect(evaluateBedtime(null, 23, 0)).toBe('noData');
  });

  it('returns "onTime" when exactly at target', () => {
    const actual = new Date('2026-02-27T23:00:00');
    expect(evaluateBedtime(actual, 23, 0)).toBe('onTime');
  });

  it('returns "onTime" when within 30 minutes after target', () => {
    const actual = new Date('2026-02-27T23:29:00');
    expect(evaluateBedtime(actual, 23, 0)).toBe('onTime');
  });

  it('returns "onTime" when exactly 30 minutes after target', () => {
    const actual = new Date('2026-02-27T23:30:00');
    expect(evaluateBedtime(actual, 23, 0)).toBe('onTime');
  });

  it('returns "late" when 31 minutes after target', () => {
    const actual = new Date('2026-02-27T23:31:00');
    expect(evaluateBedtime(actual, 23, 0)).toBe('late');
  });

  it('returns "onTime" when within 30 minutes before target', () => {
    const actual = new Date('2026-02-27T22:30:00');
    expect(evaluateBedtime(actual, 23, 0)).toBe('onTime');
  });

  it('returns "late" when 31 minutes before target', () => {
    const actual = new Date('2026-02-27T22:29:00');
    expect(evaluateBedtime(actual, 23, 0)).toBe('late');
  });

  it('returns "late" when far from target', () => {
    const actual = new Date('2026-02-27T20:00:00');
    expect(evaluateBedtime(actual, 23, 0)).toBe('late');
  });

  // Midnight crossing cases
  it('handles midnight crossing: target 23:00, actual 0:30 (next day) → late (90 min late)', () => {
    // 0:30 is 90 minutes after 23:00 → exceeds 30 min tolerance
    const actual = new Date('2026-02-28T00:30:00');
    expect(evaluateBedtime(actual, 23, 0)).toBe('late');
  });

  it('handles midnight crossing: target 23:00, actual 23:20 → onTime', () => {
    const actual = new Date('2026-02-27T23:20:00');
    expect(evaluateBedtime(actual, 23, 0)).toBe('onTime');
  });

  it('handles midnight crossing: target 23:30, actual 0:00 (next day) → onTime (30 min late)', () => {
    // 0:00 is 30 minutes after 23:30 → exactly at tolerance
    const actual = new Date('2026-02-28T00:00:00');
    expect(evaluateBedtime(actual, 23, 30)).toBe('onTime');
  });

  it('handles midnight crossing: target 23:30, actual 0:01 (next day) → late (31 min late)', () => {
    const actual = new Date('2026-02-28T00:01:00');
    expect(evaluateBedtime(actual, 23, 30)).toBe('late');
  });

  it('handles midnight crossing: target 0:00, actual 23:40 (prev day) → onTime (20 min early)', () => {
    const actual = new Date('2026-02-27T23:40:00');
    expect(evaluateBedtime(actual, 0, 0)).toBe('onTime');
  });

  it('handles midnight crossing: target 0:00, actual 0:25 → onTime (25 min late)', () => {
    const actual = new Date('2026-02-28T00:25:00');
    expect(evaluateBedtime(actual, 0, 0)).toBe('onTime');
  });

  it('handles midnight crossing: target 0:00, actual 23:00 → late (60 min early)', () => {
    const actual = new Date('2026-02-27T23:00:00');
    expect(evaluateBedtime(actual, 0, 0)).toBe('late');
  });
});

describe('calculateDailyGrade', () => {
  it('returns "excellent" when morning pass and bedtime onTime', () => {
    expect(calculateDailyGrade(true, 'onTime')).toBe('excellent');
  });

  it('returns "good" when morning pass and bedtime late', () => {
    expect(calculateDailyGrade(true, 'late')).toBe('good');
  });

  it('returns "good" when morning pass and bedtime noData', () => {
    expect(calculateDailyGrade(true, 'noData')).toBe('good');
  });

  it('returns "fair" when morning fail and bedtime onTime', () => {
    expect(calculateDailyGrade(false, 'onTime')).toBe('fair');
  });

  it('returns "poor" when morning fail and bedtime late', () => {
    expect(calculateDailyGrade(false, 'late')).toBe('poor');
  });

  it('returns "poor" when morning fail and bedtime noData', () => {
    expect(calculateDailyGrade(false, 'noData')).toBe('poor');
  });
});

describe('applyGradeToStreak', () => {
  const initialState: StreakState = {
    currentStreak: 0,
    longestStreak: 0,
    freezesAvailable: 0,
    freezesUsedTotal: 0,
    lastGradedDate: null,
  };

  describe('excellent grade', () => {
    it('increments streak by 1', () => {
      const result = applyGradeToStreak(initialState, 'excellent');
      expect(result.currentStreak).toBe(1);
    });

    it('adds 1 freeze', () => {
      const result = applyGradeToStreak(initialState, 'excellent');
      expect(result.freezesAvailable).toBe(1);
    });

    it('caps freezes at MAX_FREEZES (2)', () => {
      const stateWithMaxFreezes: StreakState = {
        ...initialState,
        currentStreak: 5,
        freezesAvailable: MAX_FREEZES,
      };
      const result = applyGradeToStreak(stateWithMaxFreezes, 'excellent');
      expect(result.freezesAvailable).toBe(MAX_FREEZES);
    });

    it('updates longestStreak when currentStreak exceeds it', () => {
      const state: StreakState = {
        ...initialState,
        currentStreak: 3,
        longestStreak: 3,
      };
      const result = applyGradeToStreak(state, 'excellent');
      expect(result.longestStreak).toBe(4);
    });

    it('preserves longestStreak when currentStreak does not exceed it', () => {
      const state: StreakState = {
        ...initialState,
        currentStreak: 2,
        longestStreak: 10,
      };
      const result = applyGradeToStreak(state, 'excellent');
      expect(result.currentStreak).toBe(3);
      expect(result.longestStreak).toBe(10);
    });
  });

  describe('good grade', () => {
    it('increments streak by 1', () => {
      const state: StreakState = { ...initialState, currentStreak: 3 };
      const result = applyGradeToStreak(state, 'good');
      expect(result.currentStreak).toBe(4);
    });

    it('does not change freezes', () => {
      const state: StreakState = { ...initialState, freezesAvailable: 1 };
      const result = applyGradeToStreak(state, 'good');
      expect(result.freezesAvailable).toBe(1);
    });

    it('updates longestStreak when currentStreak exceeds it', () => {
      const state: StreakState = {
        ...initialState,
        currentStreak: 5,
        longestStreak: 5,
      };
      const result = applyGradeToStreak(state, 'good');
      expect(result.longestStreak).toBe(6);
    });
  });

  describe('fair grade', () => {
    it('does not change streak', () => {
      const state: StreakState = { ...initialState, currentStreak: 5 };
      const result = applyGradeToStreak(state, 'fair');
      expect(result.currentStreak).toBe(5);
    });

    it('does not change freezes', () => {
      const state: StreakState = { ...initialState, freezesAvailable: 2 };
      const result = applyGradeToStreak(state, 'fair');
      expect(result.freezesAvailable).toBe(2);
    });

    it('does not change longestStreak', () => {
      const state: StreakState = { ...initialState, longestStreak: 10 };
      const result = applyGradeToStreak(state, 'fair');
      expect(result.longestStreak).toBe(10);
    });
  });

  describe('poor grade', () => {
    it('consumes a freeze when available, keeping streak', () => {
      const state: StreakState = {
        ...initialState,
        currentStreak: 5,
        freezesAvailable: 1,
      };
      const result = applyGradeToStreak(state, 'poor');
      expect(result.currentStreak).toBe(5);
      expect(result.freezesAvailable).toBe(0);
    });

    it('increments freezesUsedTotal when consuming a freeze', () => {
      const state: StreakState = {
        ...initialState,
        currentStreak: 5,
        freezesAvailable: 1,
        freezesUsedTotal: 2,
      };
      const result = applyGradeToStreak(state, 'poor');
      expect(result.freezesUsedTotal).toBe(3);
    });

    it('resets streak to 0 when no freezes available', () => {
      const state: StreakState = {
        ...initialState,
        currentStreak: 5,
        freezesAvailable: 0,
      };
      const result = applyGradeToStreak(state, 'poor');
      expect(result.currentStreak).toBe(0);
    });

    it('does not change freezesUsedTotal when resetting streak', () => {
      const state: StreakState = {
        ...initialState,
        currentStreak: 5,
        freezesAvailable: 0,
        freezesUsedTotal: 2,
      };
      const result = applyGradeToStreak(state, 'poor');
      expect(result.freezesUsedTotal).toBe(2);
    });

    it('preserves longestStreak when resetting streak', () => {
      const state: StreakState = {
        ...initialState,
        currentStreak: 5,
        longestStreak: 10,
        freezesAvailable: 0,
      };
      const result = applyGradeToStreak(state, 'poor');
      expect(result.currentStreak).toBe(0);
      expect(result.longestStreak).toBe(10);
    });
  });

  describe('immutability', () => {
    it('does not mutate the original state', () => {
      const state: StreakState = {
        currentStreak: 3,
        longestStreak: 5,
        freezesAvailable: 1,
        freezesUsedTotal: 0,
        lastGradedDate: '2026-02-26',
      };
      const original = { ...state };
      applyGradeToStreak(state, 'excellent');

      expect(state).toEqual(original);
    });
  });

  describe('freeze accumulation scenario', () => {
    it('accumulates freezes up to MAX_FREEZES over multiple excellent grades', () => {
      let state: StreakState = { ...initialState };

      // First excellent: freeze 0 → 1
      state = applyGradeToStreak(state, 'excellent');
      expect(state.freezesAvailable).toBe(1);

      // Second excellent: freeze 1 → 2
      state = applyGradeToStreak(state, 'excellent');
      expect(state.freezesAvailable).toBe(2);

      // Third excellent: freeze stays at 2 (capped)
      state = applyGradeToStreak(state, 'excellent');
      expect(state.freezesAvailable).toBe(2);
      expect(state.currentStreak).toBe(3);
    });

    it('uses freezes then resets on consecutive poor grades', () => {
      const state: StreakState = {
        ...initialState,
        currentStreak: 10,
        longestStreak: 10,
        freezesAvailable: 2,
      };

      // First poor: use freeze (2 → 1), streak maintained
      const after1 = applyGradeToStreak(state, 'poor');
      expect(after1.freezesAvailable).toBe(1);
      expect(after1.currentStreak).toBe(10);

      // Second poor: use freeze (1 → 0), streak maintained
      const after2 = applyGradeToStreak(after1, 'poor');
      expect(after2.freezesAvailable).toBe(0);
      expect(after2.currentStreak).toBe(10);

      // Third poor: no freezes, streak reset
      const after3 = applyGradeToStreak(after2, 'poor');
      expect(after3.freezesAvailable).toBe(0);
      expect(after3.currentStreak).toBe(0);
      expect(after3.longestStreak).toBe(10);
    });
  });
});
