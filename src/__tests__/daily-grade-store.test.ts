import AsyncStorage from '@react-native-async-storage/async-storage';
import { INITIAL_STREAK_STATE, useDailyGradeStore } from '../stores/daily-grade-store';
import type { DailyGradeRecord } from '../types/daily-grade';
import type { StreakState } from '../types/streak';

const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useDailyGradeStore.setState({
    grades: [],
    streak: INITIAL_STREAK_STATE,
    loaded: false,
  });
});

/** テスト用の DailyGradeRecord を生成するヘルパー */
function makeRecord(overrides: Partial<DailyGradeRecord> = {}): DailyGradeRecord {
  return {
    date: '2026-02-27',
    grade: 'good',
    morningPass: true,
    bedtimeResult: 'late',
    bedtimeTarget: '23:00',
    actualBedtime: '2026-02-27T00:30:00.000Z',
    ...overrides,
  };
}

describe('daily-grade-store', () => {
  describe('loadGrades', () => {
    it('loads empty grades and initial streak when no stored data', async () => {
      mockGetItem.mockResolvedValue(null);

      await useDailyGradeStore.getState().loadGrades();

      const state = useDailyGradeStore.getState();
      expect(state.grades).toEqual([]);
      expect(state.streak).toEqual(INITIAL_STREAK_STATE);
      expect(state.loaded).toBe(true);
    });

    it('restores stored grades and streak data', async () => {
      const storedGrades: DailyGradeRecord[] = [
        makeRecord({ date: '2026-02-25', grade: 'excellent' }),
        makeRecord({ date: '2026-02-26', grade: 'good' }),
      ];
      const storedStreak: StreakState = {
        currentStreak: 2,
        longestStreak: 5,
        freezesAvailable: 1,
        freezesUsedTotal: 3,
        lastGradedDate: '2026-02-26',
      };

      mockGetItem.mockImplementation((key: string) => {
        if (key === 'daily-grades') return Promise.resolve(JSON.stringify(storedGrades));
        if (key === 'streak-state') return Promise.resolve(JSON.stringify(storedStreak));
        return Promise.resolve(null);
      });

      await useDailyGradeStore.getState().loadGrades();

      const state = useDailyGradeStore.getState();
      expect(state.grades).toEqual(storedGrades);
      expect(state.streak).toEqual(storedStreak);
      expect(state.loaded).toBe(true);
    });
  });

  describe('addGrade', () => {
    it('creates a record and updates streak', async () => {
      const record = makeRecord({ date: '2026-02-27', grade: 'good' });

      await useDailyGradeStore.getState().addGrade(record);

      const state = useDailyGradeStore.getState();
      expect(state.grades).toHaveLength(1);
      expect(state.grades[0]).toEqual(record);
      // good → streak +1
      expect(state.streak.currentStreak).toBe(1);
      expect(state.streak.lastGradedDate).toBe('2026-02-27');
    });

    it('persists both grades and streak to AsyncStorage', async () => {
      const record = makeRecord({ date: '2026-02-27', grade: 'good' });

      await useDailyGradeStore.getState().addGrade(record);

      expect(mockSetItem).toHaveBeenCalledWith('daily-grades', expect.any(String));
      expect(mockSetItem).toHaveBeenCalledWith('streak-state', expect.any(String));
    });

    it('increments streak and adds freeze for excellent grade', async () => {
      const record = makeRecord({
        date: '2026-02-27',
        grade: 'excellent',
        morningPass: true,
        bedtimeResult: 'onTime',
      });

      await useDailyGradeStore.getState().addGrade(record);

      const state = useDailyGradeStore.getState();
      expect(state.streak.currentStreak).toBe(1);
      expect(state.streak.freezesAvailable).toBe(1);
    });

    it('resets streak on poor grade with no freezes', async () => {
      // Build up a streak first
      useDailyGradeStore.setState({
        grades: [makeRecord({ date: '2026-02-25', grade: 'good' })],
        streak: {
          currentStreak: 3,
          longestStreak: 5,
          freezesAvailable: 0,
          freezesUsedTotal: 0,
          lastGradedDate: '2026-02-25',
        },
        loaded: true,
      });

      const poorRecord = makeRecord({
        date: '2026-02-26',
        grade: 'poor',
        morningPass: false,
        bedtimeResult: 'late',
      });

      await useDailyGradeStore.getState().addGrade(poorRecord);

      const state = useDailyGradeStore.getState();
      expect(state.streak.currentStreak).toBe(0);
      expect(state.streak.longestStreak).toBe(5); // longestStreak preserved
      expect(state.streak.freezesAvailable).toBe(0);
    });

    it('consumes freeze on poor grade when freezes available', async () => {
      useDailyGradeStore.setState({
        grades: [makeRecord({ date: '2026-02-25', grade: 'excellent' })],
        streak: {
          currentStreak: 3,
          longestStreak: 5,
          freezesAvailable: 1,
          freezesUsedTotal: 2,
          lastGradedDate: '2026-02-25',
        },
        loaded: true,
      });

      const poorRecord = makeRecord({
        date: '2026-02-26',
        grade: 'poor',
        morningPass: false,
        bedtimeResult: 'late',
      });

      await useDailyGradeStore.getState().addGrade(poorRecord);

      const state = useDailyGradeStore.getState();
      // Streak preserved because freeze was consumed
      expect(state.streak.currentStreak).toBe(3);
      expect(state.streak.freezesAvailable).toBe(0);
      expect(state.streak.freezesUsedTotal).toBe(3);
    });

    it('replaces existing record for same date (idempotency)', async () => {
      const firstRecord = makeRecord({ date: '2026-02-27', grade: 'good' });
      await useDailyGradeStore.getState().addGrade(firstRecord);

      // Re-evaluate with a different grade for the same date
      const updatedRecord = makeRecord({
        date: '2026-02-27',
        grade: 'excellent',
        bedtimeResult: 'onTime',
      });
      await useDailyGradeStore.getState().addGrade(updatedRecord);

      const state = useDailyGradeStore.getState();
      // Should have only one record for that date
      expect(state.grades).toHaveLength(1);
      expect(state.grades[0]?.grade).toBe('excellent');
    });

    it('does not double-apply streak when date matches lastGradedDate', async () => {
      const record = makeRecord({ date: '2026-02-27', grade: 'good' });
      await useDailyGradeStore.getState().addGrade(record);

      const streakAfterFirst = useDailyGradeStore.getState().streak;
      expect(streakAfterFirst.currentStreak).toBe(1);

      // Add again for the same date — streak should NOT increment further
      const updatedRecord = makeRecord({ date: '2026-02-27', grade: 'excellent' });
      await useDailyGradeStore.getState().addGrade(updatedRecord);

      const streakAfterSecond = useDailyGradeStore.getState().streak;
      // Streak stays at 1 because of idempotency guard
      expect(streakAfterSecond.currentStreak).toBe(1);
      expect(streakAfterSecond.freezesAvailable).toBe(0); // Not incremented
    });

    it('maintains fair grade without changing streak', async () => {
      useDailyGradeStore.setState({
        grades: [],
        streak: {
          currentStreak: 3,
          longestStreak: 5,
          freezesAvailable: 1,
          freezesUsedTotal: 0,
          lastGradedDate: '2026-02-25',
        },
        loaded: true,
      });

      const fairRecord = makeRecord({
        date: '2026-02-26',
        grade: 'fair',
        morningPass: false,
        bedtimeResult: 'onTime',
      });

      await useDailyGradeStore.getState().addGrade(fairRecord);

      const state = useDailyGradeStore.getState();
      // fair → streak unchanged
      expect(state.streak.currentStreak).toBe(3);
      expect(state.streak.freezesAvailable).toBe(1);
    });
  });

  describe('getGradeForDate', () => {
    it('returns the correct record for a given date', async () => {
      const record = makeRecord({ date: '2026-02-27', grade: 'excellent' });
      await useDailyGradeStore.getState().addGrade(record);

      const result = useDailyGradeStore.getState().getGradeForDate('2026-02-27');
      expect(result).toEqual(record);
    });

    it('returns undefined for a missing date', () => {
      const result = useDailyGradeStore.getState().getGradeForDate('2026-02-27');
      expect(result).toBeUndefined();
    });
  });

  describe('getGradesForPeriod', () => {
    it('filters records within the date range', async () => {
      useDailyGradeStore.setState({
        grades: [
          makeRecord({ date: '2026-02-20', grade: 'good' }),
          makeRecord({ date: '2026-02-22', grade: 'excellent' }),
          makeRecord({ date: '2026-02-25', grade: 'fair' }),
          makeRecord({ date: '2026-02-28', grade: 'poor' }),
        ],
        streak: INITIAL_STREAK_STATE,
        loaded: true,
      });

      const result = useDailyGradeStore.getState().getGradesForPeriod('2026-02-21', '2026-02-26');

      expect(result).toHaveLength(2);
      expect(result[0]?.date).toBe('2026-02-22');
      expect(result[1]?.date).toBe('2026-02-25');
    });

    it('returns empty array when no records match', () => {
      useDailyGradeStore.setState({
        grades: [makeRecord({ date: '2026-02-20', grade: 'good' })],
        streak: INITIAL_STREAK_STATE,
        loaded: true,
      });

      const result = useDailyGradeStore.getState().getGradesForPeriod('2026-03-01', '2026-03-07');

      expect(result).toEqual([]);
    });

    it('includes records on boundary dates', () => {
      useDailyGradeStore.setState({
        grades: [
          makeRecord({ date: '2026-02-20', grade: 'good' }),
          makeRecord({ date: '2026-02-25', grade: 'excellent' }),
        ],
        streak: INITIAL_STREAK_STATE,
        loaded: true,
      });

      const result = useDailyGradeStore.getState().getGradesForPeriod('2026-02-20', '2026-02-25');

      expect(result).toHaveLength(2);
    });
  });
});
