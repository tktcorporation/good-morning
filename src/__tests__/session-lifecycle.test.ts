/**
 * セッションライフサイクルのテスト。
 *
 * Effect 版のセッションサービス（DismissService, CompletionService, RecoveryService）を
 * runEffect() 経由でテストする。expo-alarm-kit / expo-notifications は jest.setup.js でグローバルモック済み。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AlarmDismissParams } from '../services';
import {
  handleAlarmDismissEffect,
  handleSnoozeArrivalEffect,
  onAllTodosCompletedEffect,
  runEffect,
  SNOOZE_DURATION_SECONDS,
} from '../services';
import { recoverMissedDismiss, restoreSessionOnLaunch } from '../services/session';
import { useMorningSessionStore } from '../stores/morning-session-store';
import { useSettingsStore } from '../stores/settings-store';
import { useWakeRecordStore } from '../stores/wake-record-store';
import { useWakeTargetStore } from '../stores/wake-target-store';
import type { MorningSession } from '../types/morning-session';
import { resolveDismissInstant, type WakeTarget } from '../types/wake-target';

// expo-alarm-kit はグローバルモック済み。型にない拡張関数は requireMock で取得。
// biome-ignore lint/suspicious/noExplicitAny: jest mock access
const mockKit = jest.requireMock<Record<string, any>>('expo-alarm-kit');
const mockCancelAlarm = mockKit.cancelAlarm as jest.Mock;
const mockScheduleAlarm = mockKit.scheduleAlarm as jest.Mock;
const mockGetAllAlarms = mockKit.getAllAlarms as jest.Mock;
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
    taskType: 'squat',
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
    taskType: 'squat',
    enabled: true,
    targetSleepMinutes: null,
    wakeUpGoalBufferMinutes: 30,
  };
}

function createStartParams(overrides?: Partial<AlarmDismissParams>): AlarmDismissParams {
  // dismissTime を固定の過去日時にすると、scheduleSnoozeAlarms の
  // 「過去時刻のスヌーズは登録しない」ガードで全スヌーズがスキップされるため、
  // 現在時刻基準の直近の時刻を使う
  const dismissTime = new Date(Date.now() - 60 * 1000);
  return {
    target: createTargetWithTodos(),
    alarmInstant: new Date(
      dismissTime.getFullYear(),
      dismissTime.getMonth(),
      dismissTime.getDate(),
      7,
      0,
      0,
    ),
    dismissTime,
    mountedAt: new Date(Date.now() - 2 * 60 * 1000),
    dayBoundaryHour: 4,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Reset AlarmKit mocks to defaults
  mockScheduleAlarm.mockResolvedValue(true);
  mockCancelAlarm.mockResolvedValue(true);
  mockGetAllAlarms.mockReturnValue([]);
  mockGenerateUUID.mockReturnValue('test-uuid-1');
  // mockReturnValueOnce のキューは jest.clearAllMocks() では消えない。
  // ガード追加で Once が消費されないまま次テストに漏れると空配列を返して
  // 誤動作するため、キューごとリセットしてから既定値を積み直す
  mockGetSnoozeAlarmIds.mockReset();
  mockGetSnoozeAlarmIds.mockReturnValue([]);
  mockClearSnoozeAlarmIds.mockReturnValue(undefined);
  mockGetDismissEvents.mockReset();
  mockGetDismissEvents.mockReturnValue([]);
  mockClearDismissEvents.mockReturnValue(undefined);
  mockStartLiveActivity.mockResolvedValue('activity-1');
  mockEndLiveActivity.mockResolvedValue(true);

  useMorningSessionStore.setState({ session: null, loaded: true });
  useWakeRecordStore.setState({ records: [], loaded: true });
  useWakeTargetStore.setState({ target: null, loaded: true, alarmIds: [] });
  useSettingsStore.setState({ loaded: true, dayBoundaryHour: 4 });
});

describe('handleAlarmDismissEffect', () => {
  test('records ストア未ロード時は既存履歴を破壊せず何もしない', async () => {
    // addRecord はメモリ上の records 配列全体を書き戻す実装のため、
    // records が未ロード（空配列のまま）の状態で呼ぶと、既存の起床履歴
    // 全体が新規レコード 1 件で上書きされてしまう
    const existingRecordsSnapshot = [
      {
        id: 'existing-1',
        alarmId: 'wake-target',
        date: '2026-02-27',
        targetTime: { hour: 7, minute: 0 },
        alarmTriggeredAt: '2026-02-27T07:00:00.000Z',
        dismissedAt: '2026-02-27T07:01:00.000Z',
        healthKitWakeTime: null,
        result: 'great' as const,
        diffMinutes: 1,
        todos: [],
        todoCompletionSeconds: 0,
        alarmLabel: '',
        todosCompleted: true,
        todosCompletedAt: '2026-02-27T07:01:00.000Z',
        goalDeadline: null,
      },
    ];
    useWakeRecordStore.setState({ records: existingRecordsSnapshot, loaded: false });
    const params = createStartParams();

    await runEffect(handleAlarmDismissEffect(params));

    expect(useWakeRecordStore.getState().records).toEqual(existingRecordsSnapshot);
    expect(useMorningSessionStore.getState().session).toBeNull();
    expect(mockScheduleAlarm).not.toHaveBeenCalled();
  });

  test('session ストア未ロード時は既存の進行中セッションを上書きせず何もしない', async () => {
    // startSession は無条件に新規セッションを永続化する実装のため、
    // session が未ロード（isActive()=false と誤認）の状態で呼ぶと、
    // 実際には永続化されている進行中セッションを新規セッションで上書きしてしまう
    useWakeRecordStore.setState({ records: [], loaded: true });
    useMorningSessionStore.setState({ session: null, loaded: false });
    const params = createStartParams();

    await runEffect(handleAlarmDismissEffect(params));

    expect(useWakeRecordStore.getState().records).toHaveLength(0);
    expect(useMorningSessionStore.getState().session).toBeNull();
    expect(mockScheduleAlarm).not.toHaveBeenCalled();
  });

  test('settings ストア未ロード時は dayBoundaryHour がデフォルト値のまま処理されるのを防ぐため何もしない', async () => {
    // settings 未ロードだと dayBoundaryHour は初期値のままになり、
    // 誤った論理日付で record/session が作成・紐づけされてしまう
    useSettingsStore.setState({ loaded: false });
    const params = createStartParams();

    await runEffect(handleAlarmDismissEffect(params));

    expect(useWakeRecordStore.getState().records).toHaveLength(0);
    expect(useMorningSessionStore.getState().session).toBeNull();
    expect(mockScheduleAlarm).not.toHaveBeenCalled();
  });

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
    // ネイティブ台帳にも実在する（生存突合を通る）
    mockGetAllAlarms.mockReturnValue(['native-snooze-1', 'native-snooze-2', 'native-snooze-3']);
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

  test('ネイティブスヌーズ ID が台帳に実在しない場合は JS フォールバックで再スケジュールする', async () => {
    // 取り込み前に別経路の syncAlarms が孤立キャンセルで消しているケース。
    // 死んだ ID を採用すると「Live Activity はカウントダウンするが 9 分後に何も鳴らない」
    let uuidCounter = 0;
    mockGenerateUUID.mockImplementation(() => `js-snooze-${++uuidCounter}`);
    mockGetSnoozeAlarmIds.mockReturnValueOnce(['dead-1', 'dead-2']);
    mockGetAllAlarms.mockReturnValue([]);
    const params = createStartParams();

    await runEffect(handleAlarmDismissEffect(params));

    expect(mockClearSnoozeAlarmIds).toHaveBeenCalled();
    expect(mockScheduleAlarm).toHaveBeenCalled();
    const session = useMorningSessionStore.getState().session;
    expect(session?.snoozeAlarmIds.length).toBeGreaterThan(0);
    expect(session?.snoozeAlarmIds).not.toContain('dead-1');
  });

  test('ネイティブスヌーズ ID の一部だけ生存している場合は生存分のみ採用する', async () => {
    mockGetSnoozeAlarmIds.mockReturnValueOnce(['ns-1', 'dead-1', 'ns-2']);
    mockGetAllAlarms.mockReturnValue(['ns-1', 'ns-2', 'unrelated']);
    const params = createStartParams();

    await runEffect(handleAlarmDismissEffect(params));

    expect(mockScheduleAlarm).not.toHaveBeenCalled();
    expect(useMorningSessionStore.getState().session?.snoozeAlarmIds).toEqual(['ns-1', 'ns-2']);
  });

  test('先頭のネイティブスヌーズが消えている場合、snoozeFiresAt は生存している最初のスヌーズの時刻になる', async () => {
    // 生存突合で先頭 (9分後) が除外され次 (18分後) から残った場合、
    // snoozeFiresAt を固定で「dismissTime+9分」にすると、Live Activity が
    // 既に過ぎた時刻へカウントダウンしてしまう
    const params = createStartParams();
    mockGetSnoozeAlarmIds.mockReturnValueOnce(['dead-1', 'ns-2', 'ns-3']);
    mockGetAllAlarms.mockReturnValue(['ns-2', 'ns-3']);

    await runEffect(handleAlarmDismissEffect(params));

    const session = useMorningSessionStore.getState().session;
    expect(session?.snoozeAlarmIds).toEqual(['ns-2', 'ns-3']);
    const expectedFiresAt = new Date(
      params.dismissTime.getTime() + SNOOZE_DURATION_SECONDS * 1000 * 2,
    ).toISOString();
    expect(session?.snoozeFiresAt).toBe(expectedFiresAt);
  });

  test('遅延リカバリで全スヌーズ枠が過去時刻の場合、snoozeFiresAt は null のままになる', async () => {
    // scheduleSnoozeAlarms は過去 epoch のスヌーズを登録しないため、
    // dismissTime が 3 時間以上前だと 1 本も登録されず snoozeIds は空になる。
    // ここで理論上の未来値を snoozeFiresAt に入れると、実在しないスヌーズへ
    // Live Activity がカウントダウンしてしまう
    const params = createStartParams({
      dismissTime: new Date(Date.now() - 200 * 60 * 1000),
    });

    await runEffect(handleAlarmDismissEffect(params));

    expect(mockScheduleAlarm).not.toHaveBeenCalled();
    const session = useMorningSessionStore.getState().session;
    expect(session?.snoozeAlarmIds).toEqual([]);
    expect(session?.snoozeFiresAt).toBeNull();
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

  test('前夜の通常アラーム dismiss と翌暦日の override dismiss が別日として記録される', async () => {
    // resolveTimeForDismiss は暦日不一致（23:50 の暦日は override の targetDate
    // と異なる）を常に regular と判定するため、resolveOverrideAwareDateStr
    // （dateStr 算出）がこれと矛盾して override 対象日を返すと、通常アラームの
    // dismiss 記録が override 対象日に紐づき、後続の実際の override dismiss が
    // 同日重複と誤判定されて記録されなくなる
    const target: WakeTarget = {
      defaultTime: { hour: 23, minute: 50 },
      dayOverrides: {},
      nextOverride: { time: { hour: 0, minute: 10 }, targetDate: '2026-02-26' },
      todos: [],
      taskType: 'squat',
      enabled: true,
      targetSleepMinutes: null,
      wakeUpGoalBufferMinutes: 30,
    };

    const regularDismissTime = new Date('2026-02-25T23:50:00');
    const regularAlarmInstant = resolveDismissInstant(target, regularDismissTime);
    if (regularAlarmInstant === null) throw new Error('regularAlarmInstant should not be null');
    await runEffect(
      handleAlarmDismissEffect({
        target,
        alarmInstant: regularAlarmInstant,
        dismissTime: regularDismissTime,
        mountedAt: regularDismissTime,
        dayBoundaryHour: 4,
      }),
    );

    const overrideDismissTime = new Date('2026-02-26T00:10:00');
    const overrideAlarmInstant = resolveDismissInstant(target, overrideDismissTime);
    if (overrideAlarmInstant === null) throw new Error('overrideAlarmInstant should not be null');
    await runEffect(
      handleAlarmDismissEffect({
        target,
        alarmInstant: overrideAlarmInstant,
        dismissTime: overrideDismissTime,
        mountedAt: overrideDismissTime,
        dayBoundaryHour: 4,
      }),
    );

    const records = useWakeRecordStore.getState().records;
    expect(records.map((r) => r.date).sort()).toEqual(['2026-02-25', '2026-02-26']);
  });

  test('日付変更後に dismiss された前夜の通常アラームと override dismiss が別日として記録される', async () => {
    // 前夜 23:50 の通常アラームを日付が変わった直後（00:05）に dismiss すると、
    // dismissTime の暦日は既に override.targetDate と一致してしまう。
    // resolveDismissInstant は正しく前夜の通常アラームを発火候補と判定するが、
    // dateStr が dismissTime の暦日一致だけで override 対象日を採用すると、
    // 前夜の通常アラーム記録が override 対象日に紐づき、後続の実際の
    // override dismiss（00:10）が同日重複と誤判定されて記録されなくなる
    const target: WakeTarget = {
      defaultTime: { hour: 23, minute: 50 },
      dayOverrides: {},
      nextOverride: { time: { hour: 0, minute: 10 }, targetDate: '2026-02-26' },
      todos: [],
      taskType: 'squat',
      enabled: true,
      targetSleepMinutes: null,
      wakeUpGoalBufferMinutes: 30,
    };

    const regularDismissTime = new Date('2026-02-26T00:05:00');
    const regularAlarmInstant = resolveDismissInstant(target, regularDismissTime);
    if (regularAlarmInstant === null) throw new Error('regularAlarmInstant should not be null');
    await runEffect(
      handleAlarmDismissEffect({
        target,
        alarmInstant: regularAlarmInstant,
        dismissTime: regularDismissTime,
        mountedAt: regularDismissTime,
        dayBoundaryHour: 4,
      }),
    );

    const overrideDismissTime = new Date('2026-02-26T00:10:00');
    const overrideAlarmInstant = resolveDismissInstant(target, overrideDismissTime);
    if (overrideAlarmInstant === null) throw new Error('overrideAlarmInstant should not be null');
    await runEffect(
      handleAlarmDismissEffect({
        target,
        alarmInstant: overrideAlarmInstant,
        dismissTime: overrideDismissTime,
        mountedAt: overrideDismissTime,
        dayBoundaryHour: 4,
      }),
    );

    const records = useWakeRecordStore.getState().records;
    expect(records.map((r) => r.date).sort()).toEqual(['2026-02-25', '2026-02-26']);
  });

  test('深夜またぎで override が採用された dismiss は、goalDeadline が発火日基準で正しく計算される', async () => {
    // resolveDismissInstant が前日の override 発火日時を正しく返さないと、
    // goalDeadline が dismissTime の暦日（2026-02-27）基準で計算され、
    // 本来の 2026-02-27T00:20 ではなく 2026-02-28T00:20 になってしまう
    const target: WakeTarget = {
      defaultTime: { hour: 9, minute: 0 },
      dayOverrides: {},
      nextOverride: { time: { hour: 23, minute: 50 }, targetDate: '2026-02-26' },
      todos: [{ id: 'todo-1', title: 'Stretch', completed: false }],
      taskType: 'squat',
      enabled: true,
      targetSleepMinutes: null,
      wakeUpGoalBufferMinutes: 30,
    };
    const dismissTime = new Date('2026-02-27T00:05:00');
    const alarmInstant = resolveDismissInstant(target, dismissTime);
    if (alarmInstant === null) throw new Error('alarmInstant should not be null');

    await runEffect(
      handleAlarmDismissEffect({
        target,
        alarmInstant,
        dismissTime,
        mountedAt: dismissTime,
        dayBoundaryHour: 4,
      }),
    );

    const records = useWakeRecordStore.getState().records;
    expect(records).toHaveLength(1);
    expect(records[0]?.goalDeadline).toBe(new Date(2026, 1, 26, 23, 80, 0).toISOString());
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
  test('cleans up stale session (different day, windowEnd も超過済み) and ends Live Activity', async () => {
    // 別日判定だけでなく windowEnd 超過も満たす、実際に放置されたセッションを再現する
    setActiveSession({
      date: '2026-01-01',
      liveActivityId: 'activity-stale',
      windowEnd: '2026-01-01T08:00:00.000Z',
    });

    await runEffect(restoreSessionOnLaunch(4));

    expect(mockEndLiveActivity).toHaveBeenCalledWith('activity-stale');
    expect(useMorningSessionStore.getState().session).toBeNull();
  });

  test('override 対象日の暦日一致だけで、まだ windowEnd 前の前夜の通常アラームセッションを stale 破棄しない', async () => {
    // 通常 23:50(前日) のセッション（windowEnd 翌日 00:20）が有効中に、
    // nextOverride の targetDate（翌暦日）と暦日が一致しただけで
    // resolveOverrideAwareDateStr が「今日」を override 対象日と判定すると、
    // まだ windowEnd 前の有効なセッションを別日の stale セッションと
    // 誤判定して TODO 進捗ごと破棄してしまう
    jest.useFakeTimers({ now: new Date('2026-02-26T00:05:00') });
    try {
      useWakeTargetStore.setState({
        target: {
          defaultTime: { hour: 23, minute: 50 },
          dayOverrides: {},
          nextOverride: { time: { hour: 0, minute: 10 }, targetDate: '2026-02-26' },
          todos: [],
          taskType: 'squat',
          enabled: true,
          targetSleepMinutes: null,
          wakeUpGoalBufferMinutes: 30,
        },
        alarmIds: [],
        loaded: true,
      });
      setActiveSession({
        date: '2026-02-25',
        windowEnd: '2026-02-26T00:20:00.000Z',
      });

      await runEffect(restoreSessionOnLaunch(4));

      expect(useMorningSessionStore.getState().session).not.toBeNull();
      expect(mockEndLiveActivity).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
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

  test('dayBoundaryHour がアラーム時刻より後でも、override 由来の自動開始セッションを stale 破棄しない', async () => {
    // tryAutoStartSession は checkSessionWindow（override 考慮の日付解決）で
    // session.date を決める。restoreSessionOnLaunch 側が単純な論理日付
    // （このケースでは前日に倒れる）で比較すると、始まったばかりの
    // セッションを別日の stale セッションと誤判定して TODO 進捗ごと破棄する
    jest.useFakeTimers({ now: new Date('2026-02-26T07:15:00') });
    try {
      useWakeTargetStore.setState({
        target: {
          defaultTime: { hour: 22, minute: 0 },
          dayOverrides: {},
          nextOverride: { time: { hour: 7, minute: 0 }, targetDate: '2026-02-26' },
          todos: [],
          taskType: 'squat',
          enabled: true,
          targetSleepMinutes: null,
          wakeUpGoalBufferMinutes: 30,
        },
        alarmIds: [],
        loaded: true,
      });
      setActiveSession({
        date: '2026-02-26',
        windowEnd: '2026-02-26T07:45:00.000Z',
      });

      await runEffect(restoreSessionOnLaunch(8));

      expect(useMorningSessionStore.getState().session).not.toBeNull();
      expect(mockEndLiveActivity).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test('settings ストア未ロード時は stale セッション判定をスキップする（誤った dayBoundaryHour でのクリア防止）', async () => {
    // settings 未ロードだと、呼び出し元（_layout.tsx）が渡す dayBoundaryHour は
    // デフォルト値のままの可能性があり、有効な永続化済みセッションを誤って
    // 別日の stale セッションと判定して TODO 進捗ごと破棄してしまう
    useSettingsStore.setState({ loaded: false });
    setActiveSession({
      date: '2026-01-01',
      windowEnd: '2099-12-31T23:59:59.000Z',
    });

    await runEffect(restoreSessionOnLaunch(4));

    expect(useMorningSessionStore.getState().session).not.toBeNull();
    expect(mockEndLiveActivity).not.toHaveBeenCalled();
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

  test('records ストア未ロード時は expireSessionIfNeeded の保留を stale クリーンアップに誤って進めない', async () => {
    // expireSessionIfNeeded は records 未ロード時に「保留」の意味で false を
    // 返す。これを「期限切れでない」と誤解釈して stale クリーンアップに
    // 進むと、WakeRecord 未更新のままセッションが破棄され、起床結果が失われる
    useWakeRecordStore.setState({ records: [], loaded: false });
    setActiveSession({
      date: '2020-01-01',
      windowEnd: '2020-01-01T00:30:00.000Z',
      liveActivityId: 'activity-1',
    });

    await runEffect(restoreSessionOnLaunch(4));

    expect(useMorningSessionStore.getState().session).not.toBeNull();
    expect(mockEndLiveActivity).not.toHaveBeenCalled();
  });

  test('records ストア未ロード時は期限切れセッションの WakeRecord 更新をスキップし、AsyncStorage の起床履歴を空で上書きしない', async () => {
    // updateRecord は records 配列全体を書き戻す実装のため、records 未ロード
    // （空配列のまま）で呼ぶと、その空配列がそのまま AsyncStorage に永続化され、
    // 実際にストレージへ保存済みの起床履歴が失われる
    useWakeRecordStore.setState({ records: [], loaded: false });
    setActiveSession({
      windowEnd: '2020-01-01T00:00:00.000Z',
      liveActivityId: 'activity-expired',
      snoozeAlarmIds: ['snooze-expired'],
    });

    await runEffect(restoreSessionOnLaunch(4));

    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith('wake-records', expect.any(String));
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

  test('target 未ロード時は dismiss イベントを破棄せず false を返す（ロード後の再試行に委ねる）', async () => {
    // dismiss イベントは復元手段のない一度きりの記録。target ロード前に消すと
    // その朝の WakeRecord・セッション・スヌーズ取り込みが永久に失われる
    useWakeTargetStore.setState({ target: null, loaded: false, alarmIds: [] });
    mockGetDismissEvents.mockReturnValue([
      { alarmId: 'alarm-1', dismissedAt: new Date().toISOString(), payload: '' },
    ]);

    const result = await runEffect(recoverMissedDismiss(4));

    expect(result).toBe(false);
    expect(mockClearDismissEvents).not.toHaveBeenCalled();
  });

  test('records 未ロード時は重複ガードを素通りせず、イベントも破棄しない', async () => {
    const target = createTargetWithTodos();
    useWakeTargetStore.setState({ target, alarmIds: [], loaded: true });
    useWakeRecordStore.setState({ records: [], loaded: false });
    mockGetDismissEvents.mockReturnValue([
      { alarmId: 'alarm-1', dismissedAt: new Date().toISOString(), payload: '' },
    ]);

    const result = await runEffect(recoverMissedDismiss(4));

    expect(result).toBe(false);
    expect(useWakeRecordStore.getState().records).toHaveLength(0);
    expect(mockClearDismissEvents).not.toHaveBeenCalled();
  });

  test('session 未ロード時は重複ガードを素通りせず、イベントも破棄しない', async () => {
    // session 未ロードだと isActive()（session !== null）が常に false になり、
    // handleAlarmDismissEffect 側の session 未ロードガードで record/session
    // 作成自体は行われないのに、processPrimaryDismissEvent の戻り値だけを見て
    // clearDismissEvents してしまうと、イベントだけが失われる
    const target = createTargetWithTodos();
    useWakeTargetStore.setState({ target, alarmIds: [], loaded: true });
    useMorningSessionStore.setState({ session: null, loaded: false });
    mockGetDismissEvents.mockReturnValue([
      { alarmId: 'alarm-1', dismissedAt: new Date().toISOString(), payload: '' },
    ]);

    const result = await runEffect(recoverMissedDismiss(4));

    expect(result).toBe(false);
    expect(useWakeRecordStore.getState().records).toHaveLength(0);
    expect(mockClearDismissEvents).not.toHaveBeenCalled();
  });

  test('settings 未ロード時は重複ガードを素通りせず、イベントも破棄しない', async () => {
    // settings 未ロードだと dayBoundaryHour がデフォルト値のままになり、
    // 誤った論理日付で重複判定・record 作成が行われる
    const target = createTargetWithTodos();
    useWakeTargetStore.setState({ target, alarmIds: [], loaded: true });
    useSettingsStore.setState({ loaded: false });
    mockGetDismissEvents.mockReturnValue([
      { alarmId: 'alarm-1', dismissedAt: new Date().toISOString(), payload: '' },
    ]);

    const result = await runEffect(recoverMissedDismiss(4));

    expect(result).toBe(false);
    expect(useWakeRecordStore.getState().records).toHaveLength(0);
    expect(mockClearDismissEvents).not.toHaveBeenCalled();
  });

  test('recordId 確定済みセッションがアクティブなら重複 dismiss としてイベントを破棄する', async () => {
    setActiveSession({ recordId: 'rec-1' });
    const target = createTargetWithTodos();
    useWakeTargetStore.setState({ target, alarmIds: [], loaded: true });
    mockGetDismissEvents.mockReturnValue([
      { alarmId: 'alarm-1', dismissedAt: new Date().toISOString(), payload: '' },
    ]);
    // 二重 dismiss でネイティブが積み直した管理外スヌーズ
    mockGetSnoozeAlarmIds.mockReturnValue(['extra-1']);

    const result = await runEffect(recoverMissedDismiss(4));

    expect(result).toBe(false);
    expect(useWakeRecordStore.getState().records).toHaveLength(0);
    expect(mockClearDismissEvents).toHaveBeenCalled();
    // 管理外スヌーズはイベントと一緒に回収される
    expect(mockCancelAlarm).toHaveBeenCalledWith('extra-1');
    expect(mockClearSnoozeAlarmIds).toHaveBeenCalled();
  });

  test('自動開始セッション（recordId=null）がアクティブでも dismiss を処理して record とスヌーズを取り込む', async () => {
    let uuidCounter = 0;
    mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);
    setActiveSession({ recordId: null, snoozeAlarmIds: [] });
    const target = createTargetWithTodos();
    useWakeTargetStore.setState({ target, alarmIds: [], loaded: true });
    mockGetDismissEvents.mockReturnValue([
      {
        alarmId: 'alarm-1',
        dismissedAt: new Date(Date.now() - 60 * 1000).toISOString(),
        payload: '',
      },
    ]);
    mockGetSnoozeAlarmIds.mockReturnValue(['ns-1']);
    mockGetAllAlarms.mockReturnValue(['ns-1']);

    const result = await runEffect(recoverMissedDismiss(4));

    expect(result).toBe(true);
    expect(useWakeRecordStore.getState().records).toHaveLength(1);
    const session = useMorningSessionStore.getState().session;
    expect(session?.recordId).not.toBeNull();
    expect(session?.snoozeAlarmIds).toEqual(['ns-1']);
    expect(mockClearDismissEvents).toHaveBeenCalled();
  });

  test('dayBoundaryHour がアラーム時刻より後でも、override 対象日の重複判定が当日レコードと一致する', async () => {
    // tryAutoStartSession は checkSessionWindow（override 考慮）で当日レコードの
    // 有無を "2026-02-26" 基準にチェックしている。recoverMissedDismiss 側の
    // 重複判定が単純な論理日付（前日に倒れる）のままだと、既に記録済みの
    // override 対象日を見逃し、record を重複作成してしまう
    jest.useFakeTimers({ now: new Date('2026-02-26T07:15:00') });
    try {
      const target: WakeTarget = {
        defaultTime: { hour: 22, minute: 0 },
        dayOverrides: {},
        nextOverride: { time: { hour: 7, minute: 0 }, targetDate: '2026-02-26' },
        todos: [{ id: 'todo-1', title: 'Stretch', completed: false }],
        taskType: 'squat',
        enabled: true,
        targetSleepMinutes: null,
        wakeUpGoalBufferMinutes: 30,
      };
      useWakeTargetStore.setState({ target, alarmIds: [], loaded: true });
      useWakeRecordStore.setState({
        records: [
          {
            id: 'existing-1',
            alarmId: 'wake-target',
            date: '2026-02-26',
            targetTime: { hour: 7, minute: 0 },
            alarmTriggeredAt: '2026-02-26T07:00:00.000Z',
            dismissedAt: '2026-02-26T07:01:00.000Z',
            healthKitWakeTime: null,
            result: 'great',
            diffMinutes: 1,
            todos: [],
            todoCompletionSeconds: 0,
            alarmLabel: '',
            todosCompleted: true,
            todosCompletedAt: '2026-02-26T07:01:00.000Z',
            goalDeadline: null,
          },
        ],
        loaded: true,
      });
      mockGetDismissEvents.mockReturnValue([
        { alarmId: 'alarm-2', dismissedAt: '2026-02-26T07:10:00.000Z', payload: '' },
      ]);

      const result = await runEffect(recoverMissedDismiss(8));

      expect(result).toBe(false);
      expect(useWakeRecordStore.getState().records).toHaveLength(1);
      expect(mockClearDismissEvents).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test('当日レコード既存で離脱する場合、管理外のネイティブスヌーズを回収してからイベントを破棄する', async () => {
    // 回収しないと 20 本のスヌーズが 3 時間鳴り続けるか、
    // 逆に orphan cancel で ID だけ App Groups に残り続ける
    const target = createTargetWithTodos();
    useWakeTargetStore.setState({ target, alarmIds: [], loaded: true });
    const dismissTime = new Date(Date.now() - 60 * 1000);
    const { addRecord } = useWakeRecordStore.getState();
    await addRecord({
      alarmId: 'wake-target',
      date: (() => {
        // recoverMissedDismiss と同じ論理日付（dayBoundaryHour=4）で当日レコードを作る
        const d = new Date(dismissTime);
        if (d.getHours() < 4) d.setDate(d.getDate() - 1);
        const y = d.getFullYear();
        const m = (d.getMonth() + 1).toString().padStart(2, '0');
        const dd = d.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${dd}`;
      })(),
      targetTime: { hour: 7, minute: 0 },
      alarmTriggeredAt: dismissTime.toISOString(),
      dismissedAt: dismissTime.toISOString(),
      healthKitWakeTime: null,
      result: 'great',
      diffMinutes: 0,
      todos: [],
      todoCompletionSeconds: 0,
      alarmLabel: '',
      todosCompleted: true,
      todosCompletedAt: dismissTime.toISOString(),
      goalDeadline: null,
    });
    mockGetDismissEvents.mockReturnValue([
      { alarmId: 'alarm-2', dismissedAt: dismissTime.toISOString(), payload: '' },
    ]);
    mockGetSnoozeAlarmIds.mockReturnValue(['ns-1', 'ns-2']);

    const result = await runEffect(recoverMissedDismiss(4));

    expect(result).toBe(false);
    expect(mockCancelAlarm).toHaveBeenCalledWith('ns-1');
    expect(mockCancelAlarm).toHaveBeenCalledWith('ns-2');
    expect(mockClearSnoozeAlarmIds).toHaveBeenCalled();
    expect(mockClearDismissEvents).toHaveBeenCalled();
  });

  test('複数の未処理 primary dismiss イベントを全て処理し、それより前の日の起床記録を失わない', async () => {
    // アプリを開かないまま複数の朝にわたってアラームを dismiss したケース。
    // 最後の1件だけ処理してネイティブキュー全体をクリアすると、
    // それ以前の日の起床記録が永遠に失われる
    let uuidCounter = 0;
    mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);
    const target = createTargetWithTodos();
    useWakeTargetStore.setState({ target, alarmIds: [], loaded: true });
    mockGetDismissEvents.mockReturnValue([
      { alarmId: 'alarm-1', dismissedAt: '2026-02-25T07:01:00.000Z', payload: '' },
      { alarmId: 'alarm-1', dismissedAt: '2026-02-26T07:01:00.000Z', payload: '' },
    ]);

    const result = await runEffect(recoverMissedDismiss(4));

    const records = useWakeRecordStore.getState().records;
    expect(records.map((r) => r.date).sort()).toEqual(['2026-02-25', '2026-02-26']);
    expect(mockClearDismissEvents).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  test('複数の未処理 primary dismiss イベントがあっても、セッションは最新イベントの日付・スヌーズになる', async () => {
    // 古いイベントにもセッション開始・スヌーズ取り込みを行うと、セッションの
    // 日付が古いイベントのものになり、ネイティブ App Groups のスヌーズ（最新
    // イベントのものに上書きされている）が古い日付のセッションに誤って紐づく
    let uuidCounter = 0;
    mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);
    const target = createTargetWithTodos();
    useWakeTargetStore.setState({ target, alarmIds: [], loaded: true });
    mockGetDismissEvents.mockReturnValue([
      { alarmId: 'alarm-1', dismissedAt: '2026-02-25T07:01:00.000Z', payload: '' },
      { alarmId: 'alarm-1', dismissedAt: '2026-02-26T07:01:00.000Z', payload: '' },
    ]);
    mockGetSnoozeAlarmIds.mockReturnValue(['ns-1']);
    mockGetAllAlarms.mockReturnValue(['ns-1']);

    await runEffect(recoverMissedDismiss(4));

    const session = useMorningSessionStore.getState().session;
    expect(session?.date).toBe('2026-02-26');
    expect(session?.snoozeAlarmIds).toEqual(['ns-1']);
  });

  test('二重鳴動で同一論理日付に2件の primary dismiss イベントがあっても、最新イベントでセッションが開始される', async () => {
    // 二重鳴動を許容する設計（override 対象日でも通常アラームが維持される）
    // のため、同じ論理日付に override・通常アラーム両方の primary dismiss
    // イベントが積まれることがある。古いイベントで作成した進捗のない
    // レコードとの同日重複判定で最新イベントを弾いてしまうと、WakeRecord は
    // あるのにセッション・スヌーズが一切開始されないまま起床フローが失われる
    let uuidCounter = 0;
    mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);
    const target: WakeTarget = {
      defaultTime: { hour: 9, minute: 0 },
      dayOverrides: {},
      nextOverride: { time: { hour: 7, minute: 0 }, targetDate: '2026-02-26' },
      todos: [{ id: 'todo-1', title: 'Stretch', completed: false }],
      taskType: 'squat',
      enabled: true,
      targetSleepMinutes: null,
      wakeUpGoalBufferMinutes: 30,
    };
    useWakeTargetStore.setState({ target, alarmIds: [], loaded: true });
    mockGetDismissEvents.mockReturnValue([
      { alarmId: 'alarm-1', dismissedAt: '2026-02-26T07:03:00.000Z', payload: '' },
      { alarmId: 'alarm-2', dismissedAt: '2026-02-26T09:05:00.000Z', payload: '' },
    ]);

    const result = await runEffect(recoverMissedDismiss(4));

    expect(result).toBe(true);
    const records = useWakeRecordStore.getState().records;
    expect(records.filter((r) => r.date === '2026-02-26')).toHaveLength(1);
    const session = useMorningSessionStore.getState().session;
    expect(session).not.toBeNull();
    expect(session?.recordId).not.toBeNull();
  });
});
