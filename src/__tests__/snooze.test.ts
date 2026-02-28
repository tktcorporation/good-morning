// src/__tests__/snooze.test.ts
import * as AlarmKit from 'expo-alarm-kit';
import {
  handleSnoozeRefire,
  restoreSnoozeIfNeeded,
  scheduleAndStoreSnooze,
} from '../services/snooze';
import { useMorningSessionStore } from '../stores/morning-session-store';
import type { MorningSession } from '../types/morning-session';

const mockScheduleAlarm = AlarmKit.scheduleAlarm as jest.Mock;
const mockGenerateUUID = AlarmKit.generateUUID as jest.Mock;

/**
 * セッションストアにテスト用のアクティブセッション（TODO未完了）をセットする。
 * 各テストで共通のセットアップとして使用。
 */
function setActiveSession(overrides?: Partial<MorningSession>): void {
  const base = {
    recordId: 'rec-1',
    date: '2026-02-28',
    startedAt: '2026-02-28T07:00:00.000Z',
    todos: [
      { id: 'todo-1', title: 'Stretch', completed: false, completedAt: null },
      { id: 'todo-2', title: 'Drink water', completed: false, completedAt: null },
    ] as const,
    liveActivityId: null as string | null,
    ...overrides,
  };
  // Partial<MorningSession> のスプレッドで liveActivityId が undefined になり得るため、
  // null にフォールバックして型安全性を保つ
  const session: MorningSession = {
    ...base,
    liveActivityId: base.liveActivityId ?? null,
  };
  useMorningSessionStore.setState({ session, loaded: true });
}

describe('snooze service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset store to clean state
    useMorningSessionStore.setState({
      session: null,
      loaded: false,
      snoozeAlarmId: null,
      snoozeFiresAt: null,
    });
    mockGenerateUUID.mockReturnValue('snooze-uuid');
    mockScheduleAlarm.mockResolvedValue(true);
  });

  describe('scheduleAndStoreSnooze', () => {
    test('schedules snooze and stores alarm ID and fires-at time', async () => {
      const result = await scheduleAndStoreSnooze();

      expect(result).not.toBeNull();
      // ISO 文字列であること
      expect(() => new Date(result as string)).not.toThrow();

      const state = useMorningSessionStore.getState();
      expect(state.snoozeAlarmId).toBe('snooze-uuid');
      expect(state.snoozeFiresAt).toBe(result);
    });

    test('returns null and does not update store when scheduling fails', async () => {
      mockScheduleAlarm.mockResolvedValue(false);

      const result = await scheduleAndStoreSnooze();

      expect(result).toBeNull();
      const state = useMorningSessionStore.getState();
      expect(state.snoozeAlarmId).toBeNull();
      expect(state.snoozeFiresAt).toBeNull();
    });

    test('snoozeFiresAt is approximately 9 minutes in the future', async () => {
      const before = Date.now();
      const result = await scheduleAndStoreSnooze();
      const after = Date.now();

      expect(result).not.toBeNull();
      const firesAtMs = new Date(result as string).getTime();
      const expectedMin = before + 540 * 1000;
      const expectedMax = after + 540 * 1000;
      expect(firesAtMs).toBeGreaterThanOrEqual(expectedMin);
      expect(firesAtMs).toBeLessThanOrEqual(expectedMax);
    });
  });

  describe('handleSnoozeRefire', () => {
    test('reschedules snooze when session is active with incomplete todos', async () => {
      setActiveSession();

      const result = await handleSnoozeRefire();

      expect(result).toBe(true);
      expect(mockScheduleAlarm).toHaveBeenCalled();
      const state = useMorningSessionStore.getState();
      expect(state.snoozeAlarmId).toBe('snooze-uuid');
      expect(state.snoozeFiresAt).not.toBeNull();
    });

    test('returns false when no session exists', async () => {
      const result = await handleSnoozeRefire();

      expect(result).toBe(false);
      expect(mockScheduleAlarm).not.toHaveBeenCalled();
    });

    test('returns false when all todos are completed', async () => {
      setActiveSession({
        todos: [
          {
            id: 'todo-1',
            title: 'Stretch',
            completed: true,
            completedAt: '2026-02-28T07:05:00.000Z',
          },
          {
            id: 'todo-2',
            title: 'Water',
            completed: true,
            completedAt: '2026-02-28T07:06:00.000Z',
          },
        ],
      });

      const result = await handleSnoozeRefire();

      expect(result).toBe(false);
      expect(mockScheduleAlarm).not.toHaveBeenCalled();
    });
  });

  describe('restoreSnoozeIfNeeded', () => {
    test('restores snooze when session is active, todos incomplete, and no snooze scheduled', async () => {
      setActiveSession();

      const result = await restoreSnoozeIfNeeded();

      expect(result).toBe(true);
      expect(mockScheduleAlarm).toHaveBeenCalled();
      const state = useMorningSessionStore.getState();
      expect(state.snoozeAlarmId).toBe('snooze-uuid');
    });

    test('returns false when no session exists', async () => {
      const result = await restoreSnoozeIfNeeded();

      expect(result).toBe(false);
      expect(mockScheduleAlarm).not.toHaveBeenCalled();
    });

    test('returns false when all todos are completed', async () => {
      setActiveSession({
        todos: [
          {
            id: 'todo-1',
            title: 'Stretch',
            completed: true,
            completedAt: '2026-02-28T07:05:00.000Z',
          },
        ],
      });

      const result = await restoreSnoozeIfNeeded();

      expect(result).toBe(false);
      expect(mockScheduleAlarm).not.toHaveBeenCalled();
    });

    test('returns false when snooze is already scheduled (prevents double scheduling)', async () => {
      setActiveSession();
      useMorningSessionStore.setState({ snoozeAlarmId: 'existing-snooze-id' });

      const result = await restoreSnoozeIfNeeded();

      expect(result).toBe(false);
      expect(mockScheduleAlarm).not.toHaveBeenCalled();
    });
  });
});
