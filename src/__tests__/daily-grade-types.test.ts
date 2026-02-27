import type { BedtimeResult, DailyGrade, DailyGradeRecord } from '../types/daily-grade';
import type { StreakState } from '../types/streak';
import { MAX_FREEZES } from '../types/streak';

describe('DailyGrade type', () => {
  it('accepts all valid grade values', () => {
    const grades: DailyGrade[] = ['excellent', 'good', 'fair', 'poor'];
    expect(grades).toHaveLength(4);
  });
});

describe('BedtimeResult type', () => {
  it('accepts all valid bedtime result values', () => {
    const results: BedtimeResult[] = ['onTime', 'late', 'noData'];
    expect(results).toHaveLength(3);
  });
});

describe('DailyGradeRecord', () => {
  it('can be instantiated with all fields', () => {
    const record: DailyGradeRecord = {
      date: '2026-02-27',
      grade: 'excellent',
      morningPass: true,
      bedtimeResult: 'onTime',
      bedtimeTarget: '23:00',
      actualBedtime: '2026-02-27T23:15:00.000Z',
    };

    expect(record.date).toBe('2026-02-27');
    expect(record.grade).toBe('excellent');
    expect(record.morningPass).toBe(true);
    expect(record.bedtimeResult).toBe('onTime');
    expect(record.bedtimeTarget).toBe('23:00');
    expect(record.actualBedtime).toBe('2026-02-27T23:15:00.000Z');
  });

  it('allows null for bedtimeTarget and actualBedtime', () => {
    const record: DailyGradeRecord = {
      date: '2026-02-27',
      grade: 'poor',
      morningPass: false,
      bedtimeResult: 'noData',
      bedtimeTarget: null,
      actualBedtime: null,
    };

    expect(record.bedtimeTarget).toBeNull();
    expect(record.actualBedtime).toBeNull();
  });
});

describe('StreakState', () => {
  it('can be instantiated with all fields', () => {
    const state: StreakState = {
      currentStreak: 5,
      longestStreak: 10,
      freezesAvailable: 2,
      freezesUsedTotal: 3,
      lastGradedDate: '2026-02-26',
    };

    expect(state.currentStreak).toBe(5);
    expect(state.longestStreak).toBe(10);
    expect(state.freezesAvailable).toBe(2);
    expect(state.freezesUsedTotal).toBe(3);
    expect(state.lastGradedDate).toBe('2026-02-26');
  });

  it('allows null for lastGradedDate (initial state)', () => {
    const state: StreakState = {
      currentStreak: 0,
      longestStreak: 0,
      freezesAvailable: 0,
      freezesUsedTotal: 0,
      lastGradedDate: null,
    };

    expect(state.lastGradedDate).toBeNull();
  });
});

describe('MAX_FREEZES', () => {
  it('is 2', () => {
    expect(MAX_FREEZES).toBe(2);
  });
});
