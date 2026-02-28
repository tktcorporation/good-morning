// src/__tests__/snooze.test.ts
import { handleSnoozeArrival } from '../services/snooze';
import { useMorningSessionStore } from '../stores/morning-session-store';
import type { MorningSession } from '../types/morning-session';

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
  const session: MorningSession = {
    ...base,
    liveActivityId: base.liveActivityId ?? null,
  };
  useMorningSessionStore.setState({ session, loaded: true });
}

describe('snooze service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useMorningSessionStore.setState({
      session: null,
      loaded: false,
      snoozeAlarmIds: [],
      snoozeFiresAt: null,
    });
  });

  describe('handleSnoozeArrival', () => {
    test('returns true and updates snoozeFiresAt when session has incomplete todos', () => {
      setActiveSession();

      const result = handleSnoozeArrival();

      expect(result).toBe(true);
      const state = useMorningSessionStore.getState();
      expect(state.snoozeFiresAt).not.toBeNull();
      // snoozeFiresAt は約9分後であること
      const firesAtMs = new Date(state.snoozeFiresAt as string).getTime();
      const expectedMin = Date.now() + 540 * 1000 - 1000;
      const expectedMax = Date.now() + 540 * 1000 + 1000;
      expect(firesAtMs).toBeGreaterThanOrEqual(expectedMin);
      expect(firesAtMs).toBeLessThanOrEqual(expectedMax);
    });

    test('returns false when no session exists', () => {
      const result = handleSnoozeArrival();
      expect(result).toBe(false);
    });

    test('returns false when all todos are completed', () => {
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

      const result = handleSnoozeArrival();
      expect(result).toBe(false);
    });
  });
});
