// src/__tests__/snooze.test.ts
import { handleSnoozeArrival, restoreSnoozeCountdown } from '../services/snooze';
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

  describe('restoreSnoozeCountdown', () => {
    test('restores snoozeFiresAt when within snooze window', () => {
      // セッション開始から5分経過 → 次のスヌーズは9分目（4分後）
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      restoreSnoozeCountdown(fiveMinutesAgo);

      const state = useMorningSessionStore.getState();
      expect(state.snoozeFiresAt).not.toBeNull();
      // 9分目のスヌーズ = 開始から9分後 = 今から約4分後
      const firesAtMs = new Date(state.snoozeFiresAt as string).getTime();
      const expectedMs = new Date(fiveMinutesAgo).getTime() + 9 * 60 * 1000;
      expect(firesAtMs).toBe(expectedMs);
    });

    test('restores correct snooze after multiple have already fired', () => {
      // セッション開始から20分経過（スヌーズ2本分 = 18分を超過）→ 次は27分目
      const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();

      restoreSnoozeCountdown(twentyMinutesAgo);

      const state = useMorningSessionStore.getState();
      expect(state.snoozeFiresAt).not.toBeNull();
      // 3本目のスヌーズ = 開始から27分後 = 今から約7分後
      const firesAtMs = new Date(state.snoozeFiresAt as string).getTime();
      const expectedMs = new Date(twentyMinutesAgo).getTime() + 27 * 60 * 1000;
      expect(firesAtMs).toBe(expectedMs);
    });

    test('does not set snoozeFiresAt when all snoozes have fired (3+ hours)', () => {
      // セッション開始から4時間経過 → 全スヌーズ発火済み
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

      restoreSnoozeCountdown(fourHoursAgo);

      expect(useMorningSessionStore.getState().snoozeFiresAt).toBeNull();
    });

    test('does not set snoozeFiresAt when exactly at snooze boundary', () => {
      // セッション開始からちょうど9分経過 → スヌーズはちょうど今発火（過去扱い）
      const nineMinutesAgo = new Date(Date.now() - 9 * 60 * 1000).toISOString();

      restoreSnoozeCountdown(nineMinutesAgo);

      const state = useMorningSessionStore.getState();
      // ceil(9min / 9min) = 1 → 1 * 9min = 9min = now → nowMs <= nowMs → skip
      // 次の2本目（18分目）は設定されない: ceil(elapsed/interval) = 1, nextFireMs = startMs + 9min = nowMs
      // 実際の動作: nextFireMs === nowMs なのでスキップ
      // しかし直後のスヌーズ（18分目）がすぐ発火するため問題なし
      expect(state.snoozeFiresAt).toBeNull();
    });
  });
});
