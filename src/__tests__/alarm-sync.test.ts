/**
 * alarm-sync.ts のテスト。
 *
 * syncAlarms() がストアの状態に基づいてアラームスケジュールを正しく同期するかを検証する。
 * alarm-kit はモック化してネイティブモジュールへの依存を排除。
 */

import { useMorningSessionStore } from '../stores/morning-session-store';
import { useWakeTargetStore } from '../stores/wake-target-store';
import type { WakeTarget } from '../types/wake-target';

jest.mock('../services/alarm-kit', () => ({
  cancelAllAlarms: jest.fn().mockResolvedValue(undefined),
  cancelAlarmsByIds: jest.fn().mockResolvedValue(undefined),
  scheduleWakeTargetAlarm: jest.fn().mockResolvedValue(['alarm-1', 'alarm-2']),
}));

const { cancelAllAlarms, cancelAlarmsByIds, scheduleWakeTargetAlarm } = jest.requireMock(
  '../services/alarm-kit',
) as {
  cancelAllAlarms: jest.Mock;
  cancelAlarmsByIds: jest.Mock;
  scheduleWakeTargetAlarm: jest.Mock;
};

// syncAlarms のインポートは alarm-kit モック後に行う
import { syncAlarms } from '../services/alarm-sync';

function createTarget(overrides?: Partial<WakeTarget>): WakeTarget {
  return {
    defaultTime: { hour: 7, minute: 0 },
    dayOverrides: {},
    nextOverride: null,
    todos: [],
    enabled: true,
    soundId: 'default',
    targetSleepMinutes: null,
    wakeUpGoalBufferMinutes: 30,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useMorningSessionStore.setState({ session: null, loaded: true });
  useWakeTargetStore.setState({ target: null, loaded: false, alarmIds: [] });
});

describe('syncAlarms', () => {
  test('schedules alarms when target is enabled and no session active', async () => {
    const target = createTarget();
    useWakeTargetStore.setState({ target, loaded: true, alarmIds: [] });

    await syncAlarms();

    expect(scheduleWakeTargetAlarm).toHaveBeenCalledWith(target);
    expect(useWakeTargetStore.getState().alarmIds).toEqual(['alarm-1', 'alarm-2']);
  });

  test('cancels all alarms when target is disabled', async () => {
    const target = createTarget({ enabled: false });
    useWakeTargetStore.setState({ target, loaded: true, alarmIds: ['old-1'] });

    await syncAlarms();

    expect(cancelAllAlarms).toHaveBeenCalled();
    expect(scheduleWakeTargetAlarm).not.toHaveBeenCalled();
    expect(useWakeTargetStore.getState().alarmIds).toEqual([]);
  });

  test('cancels all alarms when target is null', async () => {
    useWakeTargetStore.setState({ target: null, loaded: true, alarmIds: ['old-1'] });

    await syncAlarms();

    expect(cancelAllAlarms).toHaveBeenCalled();
    expect(useWakeTargetStore.getState().alarmIds).toEqual([]);
  });

  test('does nothing when session is active (protects snooze alarms)', async () => {
    const target = createTarget();
    useWakeTargetStore.setState({ target, loaded: true, alarmIds: [] });
    useMorningSessionStore.setState({
      session: {
        recordId: 'rec-1',
        date: '2026-03-06',
        startedAt: '2026-03-06T07:00:00.000Z',
        todos: [{ id: 'todo-1', title: 'Test', completed: false, completedAt: null }],
        liveActivityId: null,
        goalDeadline: null,
        snoozeAlarmIds: ['snooze-1'],
        snoozeFiresAt: '2026-03-06T07:09:00.000Z',
      },
      loaded: true,
    });

    await syncAlarms();

    // セッションアクティブ中はアラームに触らない
    expect(cancelAllAlarms).not.toHaveBeenCalled();
    expect(scheduleWakeTargetAlarm).not.toHaveBeenCalled();
  });

  test('does nothing when store is not loaded yet', async () => {
    useWakeTargetStore.setState({ target: null, loaded: false });

    await syncAlarms();

    expect(cancelAllAlarms).not.toHaveBeenCalled();
    expect(scheduleWakeTargetAlarm).not.toHaveBeenCalled();
  });

  test('discards stale results when called concurrently', async () => {
    const target = createTarget();
    useWakeTargetStore.setState({ target, loaded: true, alarmIds: [] });

    // 1回目の呼び出しを遅延させる
    let resolveFirst: (ids: string[]) => void;
    scheduleWakeTargetAlarm.mockImplementationOnce(
      () =>
        new Promise<string[]>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    // 2回目の呼び出しは即座に解決
    scheduleWakeTargetAlarm.mockResolvedValueOnce(['alarm-new-1', 'alarm-new-2']);

    const first = syncAlarms();
    const second = syncAlarms();

    // 1回目を遅延解決
    resolveFirst!(['alarm-stale-1']);
    await first;
    await second;

    // 1回目の結果（stale）はキャンセルされること
    expect(cancelAlarmsByIds).toHaveBeenCalledWith(['alarm-stale-1']);
    // 最終結果は2回目のもの
    expect(useWakeTargetStore.getState().alarmIds).toEqual(['alarm-new-1', 'alarm-new-2']);
  });
});
