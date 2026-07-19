/**
 * AlarmEventRouter (handleAlarmEventEffect) のテスト。
 *
 * ネイティブの getLaunchPayload は「取得と同時にクリアされる consume-once API」。
 * _layout.tsx が waitFor 判定のために先に読み取るため、ルーターは opts.launchPayload
 * 経由で受け取った値を使う（再読すると常に null になり、payload 分岐が dead code 化する）。
 *
 * ここでは cold-start / foreground-resume の各分岐が「アラームを止めたのに
 * 起床フローが始まらない・スヌーズが消える」状態にならないことを保証する。
 */

import { handleAlarmEventEffect, runEffect } from '../services';
import { useMorningSessionStore } from '../stores/morning-session-store';
import { useSettingsStore } from '../stores/settings-store';
import { useWakeRecordStore } from '../stores/wake-record-store';
import { useWakeTargetStore } from '../stores/wake-target-store';
import type { MorningSession } from '../types/morning-session';
import type { WakeTarget } from '../types/wake-target';

// biome-ignore lint/suspicious/noExplicitAny: jest mock access
const mockKit = jest.requireMock<Record<string, any>>('expo-alarm-kit');
const mockGetLaunchPayload = mockKit.getLaunchPayload as jest.Mock;
const mockGetDismissEvents = mockKit.getDismissEvents as jest.Mock;
const mockClearDismissEvents = mockKit.clearDismissEvents as jest.Mock;
const mockGetSnoozeAlarmIds = mockKit.getSnoozeAlarmIds as jest.Mock;
const mockGetAllAlarms = mockKit.getAllAlarms as jest.Mock;
const mockGenerateUUID = mockKit.generateUUID as jest.Mock;
const mockScheduleAlarm = mockKit.scheduleAlarm as jest.Mock;
const mockCancelAlarm = mockKit.cancelAlarm as jest.Mock;

/** 現在時刻から十分離れたアラーム時刻（セッションウィンドウ ±30 分の外）を作る */
function farAwayTime(): { hour: number; minute: number } {
  return { hour: (new Date().getHours() + 12) % 24, minute: 0 };
}

function createTarget(overrides?: Partial<WakeTarget>): WakeTarget {
  return {
    defaultTime: farAwayTime(),
    dayOverrides: {},
    nextOverride: null,
    todos: [{ id: 'todo-1', title: 'Stretch', completed: false }],
    enabled: true,
    targetSleepMinutes: null,
    wakeUpGoalBufferMinutes: 30,
    ...overrides,
  };
}

/** dayBoundaryHour=4 での今日の論理日付（restoreSessionOnLaunch に stale 扱いされない） */
function todayLogicalDate(): string {
  const d = new Date();
  if (d.getHours() < 4) d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function setActiveSession(overrides?: Partial<MorningSession>): void {
  const base: MorningSession = {
    recordId: 'rec-1',
    date: todayLogicalDate(),
    startedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    todos: [{ id: 'todo-1', title: 'Stretch', completed: false, completedAt: null }],
    windowEnd: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
    liveActivityId: null,
    goalDeadline: null,
    snoozeAlarmIds: [],
    snoozeFiresAt: null,
    ...overrides,
  };
  useMorningSessionStore.setState({ session: base, loaded: true });
}

function routerOpts(overrides?: {
  launchPayload?: { alarmId: string; payload: string | null } | null;
  clearExpiredOverride?: () => void;
}): {
  routerPush: jest.Mock;
  opts: {
    routerPush: (path: string) => void;
    dayBoundaryHour: number;
    clearExpiredOverride?: () => void;
    launchPayload?: { alarmId: string; payload: string | null } | null;
  };
} {
  const routerPush = jest.fn();
  return {
    routerPush,
    opts: {
      routerPush,
      dayBoundaryHour: 4,
      ...overrides,
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetLaunchPayload.mockReturnValue(null);
  mockGetDismissEvents.mockReturnValue([]);
  mockGetSnoozeAlarmIds.mockReturnValue([]);
  mockGetAllAlarms.mockReturnValue([]);
  mockScheduleAlarm.mockResolvedValue(true);
  mockCancelAlarm.mockResolvedValue(true);
  mockGenerateUUID.mockReturnValue('uuid-1');
  mockKit.startLiveActivity.mockResolvedValue(null);
  useMorningSessionStore.setState({ session: null, loaded: true });
  useWakeRecordStore.setState({ records: [], loaded: true });
  useWakeTargetStore.setState({ target: null, loaded: true, alarmIds: [] });
  useSettingsStore.setState({ loaded: true, dayBoundaryHour: 4 });
});

describe('handleAlarmEventEffect: cold-start + payload あり（非スヌーズ）', () => {
  test('opts.launchPayload の dismiss が処理され、record とセッションが作られる', async () => {
    // ネイティブ側 payload は既に consume 済み（再読は null）という前提を再現
    mockGetLaunchPayload.mockReturnValue(null);
    let uuidCounter = 0;
    mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);
    useWakeTargetStore.setState({ target: createTarget(), loaded: true, alarmIds: [] });

    const { routerPush, opts } = routerOpts({
      launchPayload: { alarmId: 'alarm-1', payload: null },
    });

    await runEffect(handleAlarmEventEffect('cold-start', opts));

    expect(useWakeRecordStore.getState().records).toHaveLength(1);
    expect(useMorningSessionStore.getState().session).not.toBeNull();
    expect(routerPush).toHaveBeenCalledWith('/');
  });

  test('アラーム経由起動では clearExpiredOverride を呼ばない（dismiss 解決前に override を消さない）', async () => {
    useWakeTargetStore.setState({ target: createTarget(), loaded: true, alarmIds: [] });
    const clearExpiredOverride = jest.fn();
    const { opts } = routerOpts({
      launchPayload: { alarmId: 'alarm-1', payload: null },
      clearExpiredOverride,
    });

    await runEffect(handleAlarmEventEffect('cold-start', opts));

    expect(clearExpiredOverride).not.toHaveBeenCalled();
  });

  test('自動開始セッション（recordId=null）中でも dismiss イベントが処理されネイティブスヌーズが取り込まれる', async () => {
    // アラーム前 30 分にアプリを開くと tryAutoStartSession が snoozeAlarmIds=[] の
    // セッションを作る。その後ロック画面 Stop → cold-start のケース。
    // 「セッションあり = 処理済み」と誤認して dismiss イベントを破棄すると、
    // ネイティブ先行スヌーズ 20 本が誰にも管理されず orphan cancel で全滅する
    useWakeTargetStore.setState({ target: createTarget(), loaded: true, alarmIds: [] });
    setActiveSession({ recordId: null });
    const dismissedAt = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    mockGetDismissEvents.mockReturnValue([{ alarmId: 'alarm-1', dismissedAt, payload: '' }]);
    mockGetSnoozeAlarmIds.mockReturnValue(['ns-1', 'ns-2']);
    mockGetAllAlarms.mockReturnValue(['ns-1', 'ns-2']);

    const { opts } = routerOpts({ launchPayload: { alarmId: 'alarm-1', payload: null } });

    await runEffect(handleAlarmEventEffect('cold-start', opts));

    const session = useMorningSessionStore.getState().session;
    expect(useWakeRecordStore.getState().records).toHaveLength(1);
    expect(session?.recordId).not.toBeNull();
    expect(session?.snoozeAlarmIds).toEqual(['ns-1', 'ns-2']);
  });
});

describe('handleAlarmEventEffect: スヌーズ payload', () => {
  test('セッションがあれば snoozeFiresAt が更新される', async () => {
    useWakeTargetStore.setState({ target: createTarget(), loaded: true, alarmIds: [] });
    setActiveSession({ snoozeFiresAt: null });

    const { routerPush, opts } = routerOpts({
      launchPayload: { alarmId: 'snooze-1', payload: '{"isSnooze":true}' },
    });

    await runEffect(handleAlarmEventEffect('cold-start', opts));

    const session = useMorningSessionStore.getState().session;
    expect(session?.snoozeFiresAt).not.toBeNull();
    expect(routerPush).toHaveBeenCalledWith('/');
  });

  test('セッションが無ければ未消化の primary dismiss イベントから起床フローを復元する', async () => {
    // アプリ非起動中に本アラームを Stop → 9 分後のスヌーズ通知経由で起動、のケース。
    // スヌーズ分岐が no-op で終わると、WakeRecord もセッションも作られない
    let uuidCounter = 0;
    mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);
    useWakeTargetStore.setState({ target: createTarget(), loaded: true, alarmIds: [] });
    const dismissedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    mockGetDismissEvents.mockReturnValue([{ alarmId: 'alarm-1', dismissedAt, payload: '' }]);

    const { routerPush, opts } = routerOpts({
      launchPayload: { alarmId: 'snooze-1', payload: '{"isSnooze":true}' },
    });

    await runEffect(handleAlarmEventEffect('cold-start', opts));

    expect(useWakeRecordStore.getState().records).toHaveLength(1);
    expect(useMorningSessionStore.getState().session).not.toBeNull();
    expect(routerPush).toHaveBeenCalledWith('/');
  });
});

describe('handleAlarmEventEffect: tryAutoStartSession のロードガード', () => {
  // dayBoundaryHour の境界をまたぐ実行時刻だとウィンドウ判定が実時刻に左右されるため、
  // セッションウィンドウ内であることが確実な時刻に固定する
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-26T07:00:00'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('session ストア未ロード時は自動開始をスキップする（既存セッション上書き防止）', async () => {
    // allSettled により他ストアのロードが完了しても session だけロード失敗のまま
    // handleAlarmEventEffect が呼ばれうる。isActive() は session !== null で
    // 判定するため、loaded=false のまま進むと「セッション無し」と誤認して
    // startSession が実行され、実際に永続化されている進行中セッションを
    // 上書きしてしまう
    const target = createTarget({ defaultTime: { hour: 7, minute: 0 } });
    useWakeTargetStore.setState({ target, loaded: true, alarmIds: [] });
    useMorningSessionStore.setState({ session: null, loaded: false });

    const { opts } = routerOpts({ launchPayload: null });

    await runEffect(handleAlarmEventEffect('cold-start', opts));

    expect(useMorningSessionStore.getState().session).toBeNull();
  });

  test('records ストア未ロード時は自動開始をスキップする（完了済みレコード見逃し防止）', async () => {
    const target = createTarget({ defaultTime: { hour: 7, minute: 0 } });
    useWakeTargetStore.setState({ target, loaded: true, alarmIds: [] });
    useMorningSessionStore.setState({ session: null, loaded: true });
    useWakeRecordStore.setState({ records: [], loaded: false });

    const { opts } = routerOpts({ launchPayload: null });

    await runEffect(handleAlarmEventEffect('cold-start', opts));

    expect(useMorningSessionStore.getState().session).toBeNull();
  });
});

describe('handleAlarmEventEffect: cold-start + payload なし', () => {
  test('期限切れ override のクリアと dismiss 復元が実行される', async () => {
    let uuidCounter = 0;
    mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);
    useWakeTargetStore.setState({ target: createTarget(), loaded: true, alarmIds: [] });
    const clearExpiredOverride = jest.fn();
    const dismissedAt = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    mockGetDismissEvents.mockReturnValue([{ alarmId: 'alarm-1', dismissedAt, payload: '' }]);

    const { routerPush, opts } = routerOpts({ launchPayload: null, clearExpiredOverride });

    await runEffect(handleAlarmEventEffect('cold-start', opts));

    expect(clearExpiredOverride).toHaveBeenCalled();
    expect(useWakeRecordStore.getState().records).toHaveLength(1);
    expect(mockClearDismissEvents).toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalledWith('/');
  });

  test('launchPayload が渡されたら kit.getLaunchPayload を再読しない', async () => {
    useWakeTargetStore.setState({ target: createTarget(), loaded: true, alarmIds: [] });
    const { opts } = routerOpts({ launchPayload: null });

    await runEffect(handleAlarmEventEffect('cold-start', opts));

    expect(mockGetLaunchPayload).not.toHaveBeenCalled();
  });
});
