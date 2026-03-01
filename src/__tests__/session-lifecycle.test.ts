// src/__tests__/session-lifecycle.test.ts

jest.mock('../services/alarm-kit', () => ({
  scheduleSnoozeAlarms: jest.fn().mockResolvedValue(['snooze-1', 'snooze-2']),
  startLiveActivity: jest.fn().mockResolvedValue('activity-1'),
  cancelAllAlarms: jest.fn().mockResolvedValue(undefined),
  endLiveActivity: jest.fn().mockResolvedValue(undefined),
  scheduleWakeTargetAlarm: jest.fn().mockResolvedValue(['alarm-new']),
  updateLiveActivity: jest.fn(),
  SNOOZE_DURATION_SECONDS: 540,
  SNOOZE_MAX_COUNT: 20,
}));

import {
  cancelAllAlarms,
  endLiveActivity,
  scheduleSnoozeAlarms,
  scheduleWakeTargetAlarm,
  startLiveActivity,
} from '../services/alarm-kit';
import {
  completeMorningSession,
  handleSnoozeArrival,
  restoreSessionOnLaunch,
  restoreSnoozeCountdown,
  startMorningSession,
} from '../services/session-lifecycle';
import { useMorningSessionStore } from '../stores/morning-session-store';
import { useWakeRecordStore } from '../stores/wake-record-store';
import { useWakeTargetStore } from '../stores/wake-target-store';
import type { MorningSession } from '../types/morning-session';
import type { WakeTarget } from '../types/wake-target';
import { getLogicalDateString } from '../utils/date';

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

describe('session-lifecycle service', () => {
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

  describe('startMorningSession', () => {
    const baseTarget: WakeTarget = {
      defaultTime: { hour: 7, minute: 0 },
      dayOverrides: {},
      nextOverride: null,
      todos: [
        { id: 'todo-1', title: 'Stretch', completed: false },
        { id: 'todo-2', title: 'Drink water', completed: false },
      ],
      enabled: true,
      soundId: 'default',
      targetSleepMinutes: null,
    };

    const dismissTime = new Date('2026-03-01T07:01:00.000Z');
    const mountedAt = new Date('2026-03-01T07:00:55.000Z');
    const resolvedTime = { hour: 7, minute: 0 };
    const dayBoundaryHour = 4;

    beforeEach(() => {
      useWakeRecordStore.setState({ records: [], loaded: true });
    });

    test('creates record, starts session, schedules snooze, and starts Live Activity', async () => {
      await startMorningSession({
        target: baseTarget,
        resolvedTime,
        dismissTime,
        mountedAt,
        dayBoundaryHour,
      });

      // レコードが作成されている
      const records = useWakeRecordStore.getState().records;
      expect(records).toHaveLength(1);
      expect(records[0]?.todosCompleted).toBe(false);

      // セッションが作成されている
      const session = useMorningSessionStore.getState().session;
      expect(session).not.toBeNull();
      expect(session?.todos).toHaveLength(2);

      // スヌーズがスケジュールされている
      expect(scheduleSnoozeAlarms).toHaveBeenCalled();
      const state = useMorningSessionStore.getState();
      expect(state.snoozeAlarmIds).toEqual(['snooze-1', 'snooze-2']);
      expect(state.snoozeFiresAt).not.toBeNull();

      // Live Activity が開始されている
      expect(startLiveActivity).toHaveBeenCalled();
      expect(session?.liveActivityId).toBe('activity-1');
    });

    test('creates only record when target has no todos', async () => {
      const noTodoTarget: WakeTarget = { ...baseTarget, todos: [] };

      await startMorningSession({
        target: noTodoTarget,
        resolvedTime,
        dismissTime,
        mountedAt,
        dayBoundaryHour,
      });

      // レコードは作成される（todosCompleted = true）
      const records = useWakeRecordStore.getState().records;
      expect(records).toHaveLength(1);
      expect(records[0]?.todosCompleted).toBe(true);

      // セッションは作成されない
      expect(useMorningSessionStore.getState().session).toBeNull();

      // スヌーズも Live Activity も呼ばれない
      expect(scheduleSnoozeAlarms).not.toHaveBeenCalled();
      expect(startLiveActivity).not.toHaveBeenCalled();
    });

    test('session is created even when snooze scheduling fails', async () => {
      (scheduleSnoozeAlarms as jest.Mock).mockRejectedValueOnce(new Error('Snooze failed'));

      await startMorningSession({
        target: baseTarget,
        resolvedTime,
        dismissTime,
        mountedAt,
        dayBoundaryHour,
      });

      // セッションは作成されている
      const session = useMorningSessionStore.getState().session;
      expect(session).not.toBeNull();

      // スヌーズ ID は空
      expect(useMorningSessionStore.getState().snoozeAlarmIds).toEqual([]);
    });

    test('session and snooze are valid even when Live Activity fails', async () => {
      (startLiveActivity as jest.Mock).mockRejectedValueOnce(new Error('LA failed'));

      await startMorningSession({
        target: baseTarget,
        resolvedTime,
        dismissTime,
        mountedAt,
        dayBoundaryHour,
      });

      // セッションは作成されている（liveActivityId は null）
      const session = useMorningSessionStore.getState().session;
      expect(session).not.toBeNull();
      expect(session?.liveActivityId).toBeNull();

      // スヌーズは正常に設定されている
      expect(useMorningSessionStore.getState().snoozeAlarmIds).toEqual(['snooze-1', 'snooze-2']);
    });
  });

  describe('completeMorningSession', () => {
    const completedSession: MorningSession = {
      recordId: 'rec-1',
      date: '2026-03-01',
      startedAt: '2026-03-01T07:00:00.000Z',
      todos: [
        {
          id: 'todo-1',
          title: 'Stretch',
          completed: true,
          completedAt: '2026-03-01T07:05:00.000Z',
        },
        {
          id: 'todo-2',
          title: 'Drink water',
          completed: true,
          completedAt: '2026-03-01T07:06:00.000Z',
        },
      ],
      liveActivityId: 'la-1',
    };

    beforeEach(() => {
      // WakeRecord ストアにレコードを設定
      useWakeRecordStore.setState({
        records: [
          {
            id: 'rec-1',
            alarmId: 'wake-target',
            date: '2026-03-01',
            targetTime: { hour: 7, minute: 0 },
            alarmTriggeredAt: '2026-03-01T06:59:55.000Z',
            dismissedAt: '2026-03-01T07:00:00.000Z',
            healthKitWakeTime: null,
            result: 'great',
            diffMinutes: 0,
            todos: [],
            todoCompletionSeconds: 0,
            alarmLabel: '',
            todosCompleted: false,
            todosCompletedAt: null,
          },
        ],
        loaded: true,
      });

      // WakeTarget ストアに有効なターゲットを設定
      useWakeTargetStore.setState({
        target: {
          defaultTime: { hour: 7, minute: 0 },
          dayOverrides: {},
          nextOverride: null,
          todos: [
            { id: 'todo-1', title: 'Stretch', completed: false },
            { id: 'todo-2', title: 'Drink water', completed: false },
          ],
          enabled: true,
          soundId: 'default',
          targetSleepMinutes: null,
        },
        loaded: true,
        alarmIds: [],
      });

      // セッションをアクティブにする
      useMorningSessionStore.setState({ session: completedSession, loaded: true });
    });

    test('cancels alarms, ends LA, updates record, clears session, reschedules', async () => {
      await completeMorningSession(completedSession);

      // cancelAllAlarms が呼ばれている
      expect(cancelAllAlarms).toHaveBeenCalled();

      // endLiveActivity が liveActivityId 付きで呼ばれている
      expect(endLiveActivity).toHaveBeenCalledWith('la-1');

      // レコードが更新されている
      const records = useWakeRecordStore.getState().records;
      const updatedRecord = records.find((r) => r.id === 'rec-1');
      expect(updatedRecord?.todosCompleted).toBe(true);
      expect(updatedRecord?.todosCompletedAt).not.toBeNull();

      // セッションがクリアされている
      expect(useMorningSessionStore.getState().session).toBeNull();

      // scheduleWakeTargetAlarm が呼ばれている
      expect(scheduleWakeTargetAlarm).toHaveBeenCalled();
    });

    test('skips endLiveActivity when liveActivityId is null', async () => {
      const sessionNoLA: MorningSession = { ...completedSession, liveActivityId: null };
      useMorningSessionStore.setState({ session: sessionNoLA, loaded: true });

      await completeMorningSession(sessionNoLA);

      // endLiveActivity は呼ばれない
      expect(endLiveActivity).not.toHaveBeenCalled();

      // セッションはクリアされている
      expect(useMorningSessionStore.getState().session).toBeNull();
    });

    test('clears session even when updateRecord fails', async () => {
      // updateRecord をモックして reject させる
      const originalUpdateRecord = useWakeRecordStore.getState().updateRecord;
      const mockUpdateRecord = jest.fn().mockRejectedValue(new Error('persist failed'));
      useWakeRecordStore.setState({ updateRecord: mockUpdateRecord });

      await completeMorningSession(completedSession);

      // セッションはクリアされている（fail-safe）
      expect(useMorningSessionStore.getState().session).toBeNull();

      // updateRecord を元に戻す
      useWakeRecordStore.setState({ updateRecord: originalUpdateRecord });
    });
  });

  describe('restoreSessionOnLaunch', () => {
    test('cleans up stale session (different day) and ends Live Activity', () => {
      setActiveSession({
        date: '2026-02-27',
        startedAt: '2026-02-27T07:00:00.000Z',
        liveActivityId: 'la-stale',
      });

      restoreSessionOnLaunch(4);

      // endLiveActivity が呼ばれている
      expect(endLiveActivity).toHaveBeenCalledWith('la-stale');

      // セッションがクリアされている
      expect(useMorningSessionStore.getState().session).toBeNull();
    });

    test('restores snooze countdown for active session with incomplete todos', () => {
      const today = getLogicalDateString(new Date(), 4);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      setActiveSession({
        date: today,
        startedAt: fiveMinutesAgo,
        todos: [
          { id: 'todo-1', title: 'Stretch', completed: false, completedAt: null },
          { id: 'todo-2', title: 'Drink water', completed: false, completedAt: null },
        ],
      });

      restoreSessionOnLaunch(4);

      // snoozeFiresAt が設定されている（スヌーズカウントダウンが復元された）
      expect(useMorningSessionStore.getState().snoozeFiresAt).not.toBeNull();

      // セッションはまだ存在する
      expect(useMorningSessionStore.getState().session).not.toBeNull();
    });

    test('ends Live Activity for completed session that still has active LA', () => {
      const today = getLogicalDateString(new Date(), 4);

      setActiveSession({
        date: today,
        startedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        todos: [
          {
            id: 'todo-1',
            title: 'Stretch',
            completed: true,
            completedAt: '2026-03-01T07:05:00.000Z',
          },
          {
            id: 'todo-2',
            title: 'Drink water',
            completed: true,
            completedAt: '2026-03-01T07:06:00.000Z',
          },
        ],
        liveActivityId: 'la-dangling',
      });

      restoreSessionOnLaunch(4);

      // endLiveActivity が呼ばれている
      expect(endLiveActivity).toHaveBeenCalledWith('la-dangling');
    });

    test('does nothing when no session exists', () => {
      // セッションなし（beforeEach でクリア済み）

      restoreSessionOnLaunch(4);

      // endLiveActivity は呼ばれない
      expect(endLiveActivity).not.toHaveBeenCalled();

      // セッションは null のまま
      expect(useMorningSessionStore.getState().session).toBeNull();
    });
  });
});
