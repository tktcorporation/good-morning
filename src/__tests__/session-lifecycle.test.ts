/**
 * セッションライフサイクルのテスト。
 *
 * Effect 版のセッションサービス（DismissService, CompletionService, RecoveryService）を
 * runEffect() 経由でテストする。expo-alarm-kit / expo-notifications は jest.setup.js でグローバルモック済み。
 */

import type { AlarmDismissParams } from '../services';
import {
  handleAlarmDismissEffect,
  handleSnoozeArrivalEffect,
  onAllTodosCompletedEffect,
  runEffect,
} from '../services';
import { recoverMissedDismiss, restoreSessionOnLaunch } from '../services/session';
import { useMorningSessionStore } from '../stores/morning-session-store';
import { useWakeRecordStore } from '../stores/wake-record-store';
import { useWakeTargetStore } from '../stores/wake-target-store';
import type { MorningSession } from '../types/morning-session';
import type { WakeTarget } from '../types/wake-target';

// expo-alarm-kit はグローバルモック済み。型にない拡張関数は requireMock で取得。
// biome-ignore lint/suspicious/noExplicitAny: jest mock access
const mockKit = jest.requireMock<Record<string, any>>('expo-alarm-kit');
const mockCancelAlarm = mockKit.cancelAlarm as jest.Mock;
const mockScheduleAlarm = mockKit.scheduleAlarm as jest.Mock;
const mockGenerateUUID = mockKit.generateUUID as jest.Mock;
const mockGetSnoozeAlarmIds = mockKit.getSnoozeAlarmIds as jest.Mock;
const mockClearSnoozeAlarmIds = mockKit.clearSnoozeAlarmIds as jest.Mock;
const mockGetDismissEvents = mockKit.getDismissEvents as jest.Mock;
const mockClearDismissEvents = mockKit.clearDismissEvents as jest.Mock;
const mockStartLiveActivity = mockKit.startLiveActivity as jest.Mock;
const mockEndLiveActivity = mockKit.endLiveActivity as jest.Mock;

/**
 * テスト用のアクティブセッションをストアに直接セットする。
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
    windowEnd: '2026-02-28T07:30:00.000Z',
    liveActivityId: null,
    goalDeadline: null,
    snoozeAlarmIds: [],
    snoozeFiresAt: null,
    ...overrides,
  };
  useMorningSessionStore.setState({ session: base, loaded: true });
}

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
    targetSleepMinutes: null,
    wakeUpGoalBufferMinutes: 30,
  };
}

function createTargetWithoutTodos(): WakeTarget {
  return {
    defaultTime: { hour: 7, minute: 0 },
    dayOverrides: {},
    nextOverride: null,
    todos: [],
    enabled: true,
    targetSleepMinutes: null,
    wakeUpGoalBufferMinutes: 30,
  };
}

function createStartParams(overrides?: Partial<AlarmDismissParams>): AlarmDismissParams {
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
  // Reset AlarmKit mocks to defaults
  mockScheduleAlarm.mockResolvedValue(true);
  mockCancelAlarm.mockResolvedValue(true);
  mockGenerateUUID.mockReturnValue('test-uuid-1');
  mockGetSnoozeAlarmIds.mockReturnValue([]);
  mockClearSnoozeAlarmIds.mockReturnValue(undefined);
  mockGetDismissEvents.mockReturnValue([]);
  mockClearDismissEvents.mockReturnValue(undefined);
  mockStartLiveActivity.mockResolvedValue('activity-1');
  mockEndLiveActivity.mockResolvedValue(true);

  useMorningSessionStore.setState({ session: null, loaded: false });
  useWakeRecordStore.setState({ records: [], loaded: true });
  useWakeTargetStore.setState({ target: null, loaded: true, alarmIds: [] });
});

describe('handleAlarmDismissEffect', () => {
  test('creates record + session + snooze + LA for target with todos', async () => {
    let uuidCounter = 0;
    mockGenerateUUID.mockImplementation(() => `snooze-uuid-${++uuidCounter}`);
    const params = createStartParams();

    await runEffect(handleAlarmDismissEffect(params));

    const records = useWakeRecordStore.getState().records;
    expect(records).toHaveLength(1);
    expect(records[0]?.alarmId).toBe('wake-target');
    expect(records[0]?.todosCompleted).toBe(false);
    expect(records[0]?.goalDeadline).not.toBeNull();

    const session = useMorningSessionStore.getState().session;
    expect(session).not.toBeNull();
    expect(session?.recordId).toBe(records[0]?.id);
    expect(session?.todos).toHaveLength(2);

    // スヌーズがスケジュールされていること
    expect(mockScheduleAlarm).toHaveBeenCalled();
    expect(session?.snoozeAlarmIds.length).toBeGreaterThan(0);
    expect(session?.snoozeFiresAt).not.toBeNull();

    // Live Activity が開始されていること
    expect(mockStartLiveActivity).toHaveBeenCalled();
    expect(session?.liveActivityId).toBe('activity-1');
  });

  test('creates only record when target has no todos', async () => {
    const params = createStartParams({ target: createTargetWithoutTodos() });

    await runEffect(handleAlarmDismissEffect(params));

    const records = useWakeRecordStore.getState().records;
    expect(records).toHaveLength(1);
    expect(records[0]?.todosCompleted).toBe(true);
    expect(records[0]?.goalDeadline).toBeNull();

    expect(useMorningSessionStore.getState().session).toBeNull();
    expect(mockScheduleAlarm).not.toHaveBeenCalled();
    expect(mockStartLiveActivity).not.toHaveBeenCalled();
  });

  test('uses native snooze IDs when available (skips JS scheduling)', async () => {
    mockGetSnoozeAlarmIds.mockReturnValueOnce([
      'native-snooze-1',
      'native-snooze-2',
      'native-snooze-3',
    ]);
    const params = createStartParams();

    await runEffect(handleAlarmDismissEffect(params));

    // ネイティブ ID が使われるため JS スケジュールは呼ばれない
    expect(mockScheduleAlarm).not.toHaveBeenCalled();
    expect(mockClearSnoozeAlarmIds).toHaveBeenCalled();

    const session = useMorningSessionStore.getState().session;
    expect(session?.snoozeAlarmIds).toEqual([
      'native-snooze-1',
      'native-snooze-2',
      'native-snooze-3',
    ]);
    expect(session?.snoozeFiresAt).not.toBeNull();
  });

  test('falls back to JS snooze scheduling when native IDs empty', async () => {
    let uuidCounter = 0;
    mockGenerateUUID.mockImplementation(() => `snooze-uuid-${++uuidCounter}`);
    const params = createStartParams();

    await runEffect(handleAlarmDismissEffect(params));

    expect(mockScheduleAlarm).toHaveBeenCalled();
    expect(mockClearSnoozeAlarmIds).not.toHaveBeenCalled();

    const session = useMorningSessionStore.getState().session;
    expect(session?.snoozeAlarmIds.length).toBeGreaterThan(0);
  });

  test('session survives Live Activity failure', async () => {
    let uuidCounter = 0;
    mockGenerateUUID.mockImplementation(() => `snooze-uuid-${++uuidCounter}`);
    mockStartLiveActivity.mockRejectedValueOnce(new Error('LA failed'));
    const params = createStartParams();

    await runEffect(handleAlarmDismissEffect(params));

    const session = useMorningSessionStore.getState().session;
    expect(session).not.toBeNull();
    expect(session?.snoozeAlarmIds.length).toBeGreaterThan(0);
    expect(session?.snoozeFiresAt).not.toBeNull();
    expect(session?.liveActivityId).toBeNull();
  });
});

describe('onAllTodosCompletedEffect', () => {
  test('cancels snooze, ends LA, updates record, but keeps session (window-based)', async () => {
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

    const target = createTargetWithTodos();
    useWakeTargetStore.setState({ target, alarmIds: ['old-alarm-1'], loaded: true });

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
    await runEffect(onAllTodosCompletedEffect(session));

    expect(mockCancelAlarm).toHaveBeenCalledWith('snooze-1');
    expect(mockCancelAlarm).toHaveBeenCalledWith('snooze-2');
    expect(mockEndLiveActivity).toHaveBeenCalledWith('activity-1');

    const updatedRecord = useWakeRecordStore.getState().records.find((r) => r.id === record.id);
    expect(updatedRecord?.todosCompleted).toBe(true);
    expect(updatedRecord?.todosCompletedAt).not.toBeNull();
    expect(updatedRecord?.todoCompletionSeconds).toBeGreaterThan(0);

    // セッションはクリアされない（ウィンドウ終了まで維持）
    expect(useMorningSessionStore.getState().session).not.toBeNull();
  });

  test('skips endLiveActivity when liveActivityId is null', async () => {
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
    await runEffect(onAllTodosCompletedEffect(session));

    expect(mockEndLiveActivity).not.toHaveBeenCalled();
    expect(useMorningSessionStore.getState().session).not.toBeNull();
  });
});

describe('restoreSessionOnLaunch', () => {
  test('cleans up stale session (different day) and ends Live Activity', async () => {
    setActiveSession({
      date: '2026-01-01',
      liveActivityId: 'activity-stale',
      windowEnd: '2099-12-31T23:59:59.000Z',
    });

    await runEffect(restoreSessionOnLaunch(4));

    expect(mockEndLiveActivity).toHaveBeenCalledWith('activity-stale');
    expect(useMorningSessionStore.getState().session).toBeNull();
  });

  test('does nothing for active session (snoozeFiresAt already persisted)', async () => {
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

    setActiveSession({
      date: todayStr,
      snoozeFiresAt: '2026-02-28T07:09:00.000Z',
      snoozeAlarmIds: ['snooze-1'],
      windowEnd: '2099-12-31T23:59:59.000Z',
    });

    await runEffect(restoreSessionOnLaunch(4));

    expect(mockEndLiveActivity).not.toHaveBeenCalled();
    expect(useMorningSessionStore.getState().session).not.toBeNull();
    expect(useMorningSessionStore.getState().session?.snoozeFiresAt).toBe(
      '2026-02-28T07:09:00.000Z',
    );
  });

  test('ends dangling Live Activity for completed session', async () => {
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

    setActiveSession({
      date: todayStr,
      liveActivityId: 'activity-dangling',
      windowEnd: '2099-12-31T23:59:59.000Z',
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

    await runEffect(restoreSessionOnLaunch(4));

    expect(mockEndLiveActivity).toHaveBeenCalledWith('activity-dangling');
    expect(useMorningSessionStore.getState().session).not.toBeNull();
  });

  test('does nothing when no session exists', async () => {
    await runEffect(restoreSessionOnLaunch(4));

    expect(mockEndLiveActivity).not.toHaveBeenCalled();
    expect(useMorningSessionStore.getState().session).toBeNull();
  });

  test('cleans up expired session (windowEnd passed)', async () => {
    setActiveSession({
      windowEnd: '2020-01-01T00:00:00.000Z',
      liveActivityId: 'activity-expired',
      snoozeAlarmIds: ['snooze-expired'],
    });

    await runEffect(restoreSessionOnLaunch(4));

    expect(useMorningSessionStore.getState().session).toBeNull();
    expect(mockCancelAlarm).toHaveBeenCalledWith('snooze-expired');
    expect(mockEndLiveActivity).toHaveBeenCalledWith('activity-expired');
  });
});

describe('handleSnoozeArrivalEffect', () => {
  test('returns true and updates snoozeFiresAt when session has incomplete todos', async () => {
    setActiveSession();

    const result = await runEffect(handleSnoozeArrivalEffect);

    expect(result).toBe(true);
    const state = useMorningSessionStore.getState();
    expect(state.session?.snoozeFiresAt).not.toBeNull();
    const firesAtMs = new Date(state.session?.snoozeFiresAt as string).getTime();
    const expectedMin = Date.now() + 540 * 1000 - 1000;
    const expectedMax = Date.now() + 540 * 1000 + 1000;
    expect(firesAtMs).toBeGreaterThanOrEqual(expectedMin);
    expect(firesAtMs).toBeLessThanOrEqual(expectedMax);
  });

  test('returns false when no session exists', async () => {
    const result = await runEffect(handleSnoozeArrivalEffect);
    expect(result).toBe(false);
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

    const result = await runEffect(handleSnoozeArrivalEffect);
    expect(result).toBe(false);
  });
});

describe('recoverMissedDismiss', () => {
  test('creates record + session from native dismiss event', async () => {
    let uuidCounter = 0;
    mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);
    const target = createTargetWithTodos();
    useWakeTargetStore.setState({ target, alarmIds: [], loaded: true });

    mockGetDismissEvents.mockReturnValueOnce([
      { alarmId: 'alarm-1', dismissedAt: '2026-03-04T07:02:00.000Z', payload: '' },
    ]);

    const result = await runEffect(recoverMissedDismiss(4));

    const records = useWakeRecordStore.getState().records;
    expect(records).toHaveLength(1);
    expect(records[0]?.dismissedAt).toBe('2026-03-04T07:02:00.000Z');
    expect(records[0]?.alarmId).toBe('wake-target');

    const session = useMorningSessionStore.getState().session;
    expect(session).not.toBeNull();
    expect(session?.todos).toHaveLength(2);

    expect(mockClearDismissEvents).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  test('skips snooze dismiss events', async () => {
    const target = createTargetWithTodos();
    useWakeTargetStore.setState({ target, alarmIds: [], loaded: true });

    mockGetDismissEvents.mockReturnValueOnce([
      {
        alarmId: 'snooze-1',
        dismissedAt: '2026-03-04T07:11:00.000Z',
        payload: '{"isSnooze":true}',
      },
    ]);

    const result = await runEffect(recoverMissedDismiss(4));

    expect(useWakeRecordStore.getState().records).toHaveLength(0);
    expect(result).toBe(false);
  });

  test('skips when session already active', async () => {
    setActiveSession();
    const target = createTargetWithTodos();
    useWakeTargetStore.setState({ target, alarmIds: [], loaded: true });

    mockGetDismissEvents.mockReturnValueOnce([
      { alarmId: 'alarm-1', dismissedAt: '2026-03-04T07:02:00.000Z', payload: '' },
    ]);

    const result = await runEffect(recoverMissedDismiss(4));

    expect(useWakeRecordStore.getState().records).toHaveLength(0);
    expect(result).toBe(false);
  });

  test('returns false when no dismiss events', async () => {
    mockGetDismissEvents.mockReturnValueOnce([]);

    const result = await runEffect(recoverMissedDismiss(4));
    expect(result).toBe(false);
  });
});
