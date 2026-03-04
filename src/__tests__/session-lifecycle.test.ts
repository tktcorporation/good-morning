/**
 * session-lifecycle.ts のテスト。
 *
 * セッションのライフサイクル関数（start / complete / restore / snooze arrival）を
 * 個別にテストする。alarm-kit はモック化して副作用を排除し、ストアの状態変化を検証する。
 */

import type { StartSessionParams } from '../services/session-lifecycle';
import { useMorningSessionStore } from '../stores/morning-session-store';
import { useWakeRecordStore } from '../stores/wake-record-store';
import { useWakeTargetStore } from '../stores/wake-target-store';
import type { MorningSession } from '../types/morning-session';
import type { WakeTarget } from '../types/wake-target';

// alarm-kit をモック化: ネイティブモジュールに依存せずオーケストレーションロジックをテスト
jest.mock('../services/alarm-kit', () => ({
  scheduleSnoozeAlarms: jest.fn().mockResolvedValue(['snooze-1', 'snooze-2']),
  startLiveActivity: jest.fn().mockResolvedValue('activity-1'),
  cancelAlarmsByIds: jest.fn().mockResolvedValue(undefined),
  endLiveActivity: jest.fn().mockResolvedValue(undefined),
  scheduleWakeTargetAlarm: jest.fn().mockResolvedValue(['alarm-new']),
  updateLiveActivity: jest.fn(),
  getDismissEvents: jest.fn().mockResolvedValue([]),
  clearDismissEvents: jest.fn().mockResolvedValue(undefined),
  SNOOZE_DURATION_SECONDS: 540,
}));

const {
  scheduleSnoozeAlarms,
  startLiveActivity,
  cancelAlarmsByIds,
  endLiveActivity,
  scheduleWakeTargetAlarm,
  getDismissEvents,
  clearDismissEvents,
} = jest.requireMock('../services/alarm-kit') as {
  scheduleSnoozeAlarms: jest.Mock;
  startLiveActivity: jest.Mock;
  cancelAlarmsByIds: jest.Mock;
  endLiveActivity: jest.Mock;
  scheduleWakeTargetAlarm: jest.Mock;
  updateLiveActivity: jest.Mock;
  getDismissEvents: jest.Mock;
  clearDismissEvents: jest.Mock;
};

import {
  completeMorningSession,
  handleSnoozeArrival,
  recoverMissedDismiss,
  restoreSessionOnLaunch,
  startMorningSession,
} from '../services/session-lifecycle';

/**
 * テスト用のアクティブセッションをストアに直接セットする。
 * 各テストで共通のセットアップとして使用。
 */
function setActiveSession(overrides?: Partial<MorningSession>): void {
  const base: MorningSession = {
    recordId: 'rec-1',
    date: '2026-02-28',
    startedAt: '2026-02-28T07:00:00.000Z',
    todos: [
      { id: 'todo-1', title: 'Stretch', completed: false, completedAt: null },
      { id: 'todo-2', title: 'Drink water', completed: false, completedAt: null },
    ],
    liveActivityId: null,
    goalDeadline: null,
    snoozeAlarmIds: [],
    snoozeFiresAt: null,
    ...overrides,
  };
  useMorningSessionStore.setState({ session: base, loaded: true });
}

/** TODO付きの WakeTarget テストデータ */
function createTargetWithTodos(): WakeTarget {
  return {
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
    wakeUpGoalBufferMinutes: 30,
  };
}

/** TODO なしの WakeTarget テストデータ */
function createTargetWithoutTodos(): WakeTarget {
  return {
    defaultTime: { hour: 7, minute: 0 },
    dayOverrides: {},
    nextOverride: null,
    todos: [],
    enabled: true,
    soundId: 'default',
    targetSleepMinutes: null,
    wakeUpGoalBufferMinutes: 30,
  };
}

/** 標準的な StartSessionParams を生成する */
function createStartParams(overrides?: Partial<StartSessionParams>): StartSessionParams {
  return {
    target: createTargetWithTodos(),
    resolvedTime: { hour: 7, minute: 0 },
    dismissTime: new Date('2026-02-28T07:01:00.000Z'),
    mountedAt: new Date('2026-02-28T07:00:00.000Z'),
    dayBoundaryHour: 4,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useMorningSessionStore.setState({ session: null, loaded: false });
  useWakeRecordStore.setState({ records: [], loaded: true });
  useWakeTargetStore.setState({ target: null, loaded: true, alarmIds: [] });
});

describe('startMorningSession', () => {
  test('creates record + session + snooze + LA for target with todos', async () => {
    const params = createStartParams();

    await startMorningSession(params);

    // WakeRecord が作成されていること
    const records = useWakeRecordStore.getState().records;
    expect(records).toHaveLength(1);
    expect(records[0]?.alarmId).toBe('wake-target');
    expect(records[0]?.todosCompleted).toBe(false);
    expect(records[0]?.goalDeadline).not.toBeNull();

    // MorningSession が作成されていること
    const session = useMorningSessionStore.getState().session;
    expect(session).not.toBeNull();
    expect(session?.recordId).toBe(records[0]?.id);
    expect(session?.todos).toHaveLength(2);

    // スヌーズがスケジュールされていること
    expect(scheduleSnoozeAlarms).toHaveBeenCalledWith(params.dismissTime);
    expect(session?.snoozeAlarmIds).toEqual(['snooze-1', 'snooze-2']);
    expect(session?.snoozeFiresAt).not.toBeNull();

    // Live Activity が開始されていること
    expect(startLiveActivity).toHaveBeenCalled();
    expect(session?.liveActivityId).toBe('activity-1');
  });

  test('creates only record when target has no todos', async () => {
    const params = createStartParams({ target: createTargetWithoutTodos() });

    await startMorningSession(params);

    // WakeRecord は作成される
    const records = useWakeRecordStore.getState().records;
    expect(records).toHaveLength(1);
    expect(records[0]?.todosCompleted).toBe(true);
    expect(records[0]?.goalDeadline).toBeNull();

    // セッションは作成されない
    expect(useMorningSessionStore.getState().session).toBeNull();

    // スヌーズも LA もスケジュールされない
    expect(scheduleSnoozeAlarms).not.toHaveBeenCalled();
    expect(startLiveActivity).not.toHaveBeenCalled();
  });

  test('session survives snooze scheduling failure', async () => {
    scheduleSnoozeAlarms.mockRejectedValueOnce(new Error('Snooze scheduling failed'));
    const params = createStartParams();

    await startMorningSession(params);

    // セッションは存在するが snoozeAlarmIds は空
    const session = useMorningSessionStore.getState().session;
    expect(session).not.toBeNull();
    expect(session?.snoozeAlarmIds).toEqual([]);
    expect(session?.snoozeFiresAt).toBeNull();

    // Live Activity は引き続き開始される
    expect(startLiveActivity).toHaveBeenCalled();
  });

  test('session survives Live Activity failure', async () => {
    startLiveActivity.mockRejectedValueOnce(new Error('LA failed'));
    const params = createStartParams();

    await startMorningSession(params);

    // セッションは存在し、スヌーズはスケジュール済み
    const session = useMorningSessionStore.getState().session;
    expect(session).not.toBeNull();
    expect(session?.snoozeAlarmIds).toEqual(['snooze-1', 'snooze-2']);
    expect(session?.snoozeFiresAt).not.toBeNull();

    // liveActivityId は null のまま
    expect(session?.liveActivityId).toBeNull();
  });
});

describe('completeMorningSession', () => {
  test('cancels only snooze alarms, ends LA, updates record, clears session, reschedules', async () => {
    // WakeRecord を事前に作成
    const { addRecord } = useWakeRecordStore.getState();
    const record = await addRecord({
      alarmId: 'wake-target',
      date: '2026-02-28',
      targetTime: { hour: 7, minute: 0 },
      alarmTriggeredAt: '2026-02-28T07:00:00.000Z',
      dismissedAt: '2026-02-28T07:01:00.000Z',
      healthKitWakeTime: null,
      result: 'great',
      diffMinutes: 1,
      todos: [
        { id: 'todo-1', title: 'Stretch', completedAt: null, orderCompleted: null },
        { id: 'todo-2', title: 'Drink water', completedAt: null, orderCompleted: null },
      ],
      todoCompletionSeconds: 0,
      alarmLabel: '',
      todosCompleted: false,
      todosCompletedAt: null,
      goalDeadline: '2026-02-28T07:30:00.000Z',
    });

    // WakeTarget を設定（再スケジュール用）
    const target = createTargetWithTodos();
    useWakeTargetStore.setState({ target, alarmIds: ['old-alarm-1'], loaded: true });

    // アクティブセッションをセット
    setActiveSession({
      recordId: record.id,
      snoozeAlarmIds: ['snooze-1', 'snooze-2'],
      liveActivityId: 'activity-1',
      goalDeadline: '2026-02-28T07:30:00.000Z',
      todos: [
        {
          id: 'todo-1',
          title: 'Stretch',
          completed: true,
          completedAt: '2026-02-28T07:05:00.000Z',
        },
        {
          id: 'todo-2',
          title: 'Drink water',
          completed: true,
          completedAt: '2026-02-28T07:06:00.000Z',
        },
      ],
    });

    const session = useMorningSessionStore.getState().session;
    if (session === null) throw new Error('session should not be null');
    await completeMorningSession(session);

    // cancelAlarmsByIds が snoozeAlarmIds で呼ばれること
    expect(cancelAlarmsByIds).toHaveBeenCalledWith(['snooze-1', 'snooze-2']);

    // endLiveActivity が呼ばれること
    expect(endLiveActivity).toHaveBeenCalledWith('activity-1');

    // WakeRecord が更新されていること
    const updatedRecord = useWakeRecordStore.getState().records.find((r) => r.id === record.id);
    expect(updatedRecord?.todosCompleted).toBe(true);
    expect(updatedRecord?.todosCompletedAt).not.toBeNull();
    expect(updatedRecord?.todoCompletionSeconds).toBeGreaterThan(0);

    // セッションがクリアされていること
    expect(useMorningSessionStore.getState().session).toBeNull();

    // 通常アラームが再スケジュールされていること
    expect(scheduleWakeTargetAlarm).toHaveBeenCalledWith(target, ['old-alarm-1']);
  });

  test('skips endLiveActivity when liveActivityId is null', async () => {
    // WakeRecord を事前に作成
    const { addRecord } = useWakeRecordStore.getState();
    const record = await addRecord({
      alarmId: 'wake-target',
      date: '2026-02-28',
      targetTime: { hour: 7, minute: 0 },
      alarmTriggeredAt: '2026-02-28T07:00:00.000Z',
      dismissedAt: '2026-02-28T07:01:00.000Z',
      healthKitWakeTime: null,
      result: 'great',
      diffMinutes: 1,
      todos: [],
      todoCompletionSeconds: 0,
      alarmLabel: '',
      todosCompleted: false,
      todosCompletedAt: null,
      goalDeadline: null,
    });

    setActiveSession({
      recordId: record.id,
      liveActivityId: null,
      snoozeAlarmIds: [],
    });

    const session = useMorningSessionStore.getState().session;
    if (session === null) throw new Error('session should not be null');
    await completeMorningSession(session);

    // endLiveActivity が呼ばれないこと
    expect(endLiveActivity).not.toHaveBeenCalled();

    // セッションはクリアされていること
    expect(useMorningSessionStore.getState().session).toBeNull();
  });

  test('clears session even when updateRecord fails', async () => {
    // updateRecord が失敗するように仕込む
    const originalUpdateRecord = useWakeRecordStore.getState().updateRecord;
    useWakeRecordStore.setState({
      updateRecord: jest.fn().mockRejectedValue(new Error('Update failed')),
    });

    setActiveSession({
      recordId: 'rec-nonexistent',
      snoozeAlarmIds: ['snooze-1'],
      liveActivityId: 'activity-1',
    });

    const session = useMorningSessionStore.getState().session;
    if (session === null) throw new Error('session should not be null');

    // エラーが throw されないこと
    await expect(completeMorningSession(session)).resolves.not.toThrow();

    // セッションがクリアされていること（無限再発火防止）
    expect(useMorningSessionStore.getState().session).toBeNull();

    // 後片付け
    useWakeRecordStore.setState({ updateRecord: originalUpdateRecord });
  });
});

describe('restoreSessionOnLaunch', () => {
  test('cleans up stale session (different day) and ends Live Activity', () => {
    // 昨日のセッション（今日は 2026-02-28 ではないので stale になる）
    setActiveSession({
      date: '2026-01-01',
      liveActivityId: 'activity-stale',
    });

    restoreSessionOnLaunch(4);

    // endLiveActivity が呼ばれること
    expect(endLiveActivity).toHaveBeenCalledWith('activity-stale');

    // セッションがクリアされていること
    expect(useMorningSessionStore.getState().session).toBeNull();
  });

  test('does nothing for active session (snoozeFiresAt already persisted)', () => {
    // 今日の日付を論理日付として取得
    const now = new Date();
    const hour = now.getHours();
    // dayBoundaryHour=4 で今が4時以降なら今日、4時前なら昨日が論理日付
    const logicalDate = new Date(now);
    if (hour < 4) {
      logicalDate.setDate(logicalDate.getDate() - 1);
    }
    const y = logicalDate.getFullYear();
    const m = (logicalDate.getMonth() + 1).toString().padStart(2, '0');
    const d = logicalDate.getDate().toString().padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;

    setActiveSession({
      date: todayStr,
      snoozeFiresAt: '2026-02-28T07:09:00.000Z',
      snoozeAlarmIds: ['snooze-1'],
    });

    restoreSessionOnLaunch(4);

    // endLiveActivity は呼ばれない（liveActivityId が null のため）
    expect(endLiveActivity).not.toHaveBeenCalled();

    // セッションはそのまま残る
    expect(useMorningSessionStore.getState().session).not.toBeNull();
    expect(useMorningSessionStore.getState().session?.snoozeFiresAt).toBe(
      '2026-02-28T07:09:00.000Z',
    );
  });

  test('ends dangling Live Activity for completed session', () => {
    // 今日の論理日付を算出
    const now = new Date();
    const hour = now.getHours();
    const logicalDate = new Date(now);
    if (hour < 4) {
      logicalDate.setDate(logicalDate.getDate() - 1);
    }
    const y = logicalDate.getFullYear();
    const m = (logicalDate.getMonth() + 1).toString().padStart(2, '0');
    const d = logicalDate.getDate().toString().padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;

    // 全TODO完了済みだが Live Activity が残っている
    setActiveSession({
      date: todayStr,
      liveActivityId: 'activity-dangling',
      todos: [
        {
          id: 'todo-1',
          title: 'Stretch',
          completed: true,
          completedAt: '2026-02-28T07:05:00.000Z',
        },
        {
          id: 'todo-2',
          title: 'Drink water',
          completed: true,
          completedAt: '2026-02-28T07:06:00.000Z',
        },
      ],
    });

    restoreSessionOnLaunch(4);

    // dangling Live Activity が終了されること
    expect(endLiveActivity).toHaveBeenCalledWith('activity-dangling');

    // セッション自体はクリアされない（completeMorningSession の仕事）
    expect(useMorningSessionStore.getState().session).not.toBeNull();
  });

  test('does nothing when no session exists', () => {
    // session は null (beforeEach でリセット済み)
    restoreSessionOnLaunch(4);

    expect(endLiveActivity).not.toHaveBeenCalled();
    expect(useMorningSessionStore.getState().session).toBeNull();
  });
});

describe('handleSnoozeArrival', () => {
  test('returns true and updates snoozeFiresAt when session has incomplete todos', () => {
    setActiveSession();

    const result = handleSnoozeArrival();

    expect(result).toBe(true);
    const state = useMorningSessionStore.getState();
    expect(state.session?.snoozeFiresAt).not.toBeNull();
    // snoozeFiresAt は約9分後であること
    const firesAtMs = new Date(state.session?.snoozeFiresAt as string).getTime();
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

describe('recoverMissedDismiss', () => {
  test('creates record + session from native dismiss event (TODO あり target)', async () => {
    const target = createTargetWithTodos();
    useWakeTargetStore.setState({ target, alarmIds: [], loaded: true });

    getDismissEvents.mockResolvedValueOnce([
      { alarmId: 'alarm-1', dismissedAt: '2026-03-04T07:02:00.000Z', payload: '' },
    ]);

    const result = await recoverMissedDismiss(4);

    // WakeRecord が作成されること
    const records = useWakeRecordStore.getState().records;
    expect(records).toHaveLength(1);
    expect(records[0]?.dismissedAt).toBe('2026-03-04T07:02:00.000Z');
    expect(records[0]?.alarmId).toBe('wake-target');

    // セッションが作成されること
    const session = useMorningSessionStore.getState().session;
    expect(session).not.toBeNull();
    expect(session?.todos).toHaveLength(2);

    // スヌーズがスケジュールされること
    expect(scheduleSnoozeAlarms).toHaveBeenCalled();

    // Live Activity が開始されること
    expect(startLiveActivity).toHaveBeenCalled();

    // dismiss イベントがクリアされること
    expect(clearDismissEvents).toHaveBeenCalled();

    // result が true（復元された）
    expect(result).toBe(true);
  });

  test('creates only record for TODO なし target', async () => {
    const target = createTargetWithoutTodos();
    useWakeTargetStore.setState({ target, alarmIds: [], loaded: true });

    getDismissEvents.mockResolvedValueOnce([
      { alarmId: 'alarm-1', dismissedAt: '2026-03-04T07:02:00.000Z', payload: '' },
    ]);

    const result = await recoverMissedDismiss(4);

    // WakeRecord は作成される
    expect(useWakeRecordStore.getState().records).toHaveLength(1);
    // セッションは作成されない
    expect(useMorningSessionStore.getState().session).toBeNull();
    // result は true
    expect(result).toBe(true);
  });

  test('skips snooze dismiss events', async () => {
    const target = createTargetWithTodos();
    useWakeTargetStore.setState({ target, alarmIds: [], loaded: true });

    getDismissEvents.mockResolvedValueOnce([
      {
        alarmId: 'snooze-1',
        dismissedAt: '2026-03-04T07:11:00.000Z',
        payload: '{"isSnooze":true}',
      },
    ]);

    const result = await recoverMissedDismiss(4);

    // スヌーズ dismiss はスキップ
    expect(useWakeRecordStore.getState().records).toHaveLength(0);
    expect(result).toBe(false);
  });

  test('skips when session already active', async () => {
    setActiveSession();
    const target = createTargetWithTodos();
    useWakeTargetStore.setState({ target, alarmIds: [], loaded: true });

    getDismissEvents.mockResolvedValueOnce([
      { alarmId: 'alarm-1', dismissedAt: '2026-03-04T07:02:00.000Z', payload: '' },
    ]);

    const result = await recoverMissedDismiss(4);

    // セッションがアクティブなので新たな WakeRecord は作成しない
    expect(useWakeRecordStore.getState().records).toHaveLength(0);
    expect(result).toBe(false);
  });

  test('skips when same date record already exists', async () => {
    const target = createTargetWithTodos();
    useWakeTargetStore.setState({ target, alarmIds: [], loaded: true });

    // 同日のレコードを事前に作成
    await useWakeRecordStore.getState().addRecord({
      alarmId: 'wake-target',
      date: '2026-03-04',
      targetTime: { hour: 7, minute: 0 },
      alarmTriggeredAt: '2026-03-04T07:00:00.000Z',
      dismissedAt: '2026-03-04T07:01:00.000Z',
      healthKitWakeTime: null,
      result: 'great',
      diffMinutes: 1,
      todos: [],
      todoCompletionSeconds: 0,
      alarmLabel: '',
      todosCompleted: true,
      todosCompletedAt: '2026-03-04T07:01:00.000Z',
      goalDeadline: null,
    });

    getDismissEvents.mockResolvedValueOnce([
      { alarmId: 'alarm-1', dismissedAt: '2026-03-04T07:02:00.000Z', payload: '' },
    ]);

    const result = await recoverMissedDismiss(4);

    // 同日レコードが既にあるので追加作成しない（元の1件のまま）
    expect(useWakeRecordStore.getState().records).toHaveLength(1);
    expect(result).toBe(false);
  });

  test('returns false when no dismiss events', async () => {
    getDismissEvents.mockResolvedValueOnce([]);

    const result = await recoverMissedDismiss(4);
    expect(result).toBe(false);
  });
});
