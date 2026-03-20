/**
 * AlarmSyncService のテスト。
 *
 * syncAlarmsEffect がストアの状態に基づいてアラームスケジュールを正しく同期するかを検証する。
 * expo-alarm-kit は jest.setup.js でグローバルモック済み。
 * Effect プログラムは runEffect() 経由で実行し、実際の AppLayer を使用する。
 */

import * as AlarmKit from 'expo-alarm-kit';
import { runEffect, syncAlarmsEffect } from '../services';
import { useMorningSessionStore } from '../stores/morning-session-store';
import { useWakeTargetStore } from '../stores/wake-target-store';
import type { WakeTarget } from '../types/wake-target';

const mockCancelAlarm = AlarmKit.cancelAlarm as jest.Mock;
const mockScheduleRepeatingAlarm = AlarmKit.scheduleRepeatingAlarm as jest.Mock;
const mockGetAllAlarms = AlarmKit.getAllAlarms as jest.Mock;
const mockGenerateUUID = AlarmKit.generateUUID as jest.Mock;

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
  mockGetAllAlarms.mockReturnValue([]);
  mockScheduleRepeatingAlarm.mockResolvedValue(true);
  mockCancelAlarm.mockResolvedValue(true);
  useMorningSessionStore.setState({ session: null, loaded: true });
  useWakeTargetStore.setState({ target: null, loaded: false, alarmIds: [] });
});

describe('syncAlarmsEffect', () => {
  test('schedules alarms when target is enabled and no session active', async () => {
    let uuidCounter = 0;
    mockGenerateUUID.mockImplementation(() => `alarm-${++uuidCounter}`);
    const target = createTarget();
    useWakeTargetStore.setState({ target, loaded: true, alarmIds: [] });

    await runEffect(syncAlarmsEffect);

    // スケジュールが呼ばれること
    expect(mockScheduleRepeatingAlarm).toHaveBeenCalled();
    // alarmIds がストアに保存されること
    expect(useWakeTargetStore.getState().alarmIds.length).toBeGreaterThan(0);
  });

  test('cancels all alarms when target is disabled', async () => {
    const target = createTarget({ enabled: false });
    useWakeTargetStore.setState({ target, loaded: true, alarmIds: ['old-1'] });
    mockGetAllAlarms.mockReturnValue(['old-1']);

    await runEffect(syncAlarmsEffect);

    expect(mockCancelAlarm).toHaveBeenCalledWith('old-1');
    expect(mockScheduleRepeatingAlarm).not.toHaveBeenCalled();
    expect(useWakeTargetStore.getState().alarmIds).toEqual([]);
  });

  test('cancels all alarms when target is null', async () => {
    useWakeTargetStore.setState({ target: null, loaded: true, alarmIds: ['old-1'] });
    mockGetAllAlarms.mockReturnValue(['old-1']);

    await runEffect(syncAlarmsEffect);

    expect(mockCancelAlarm).toHaveBeenCalled();
    expect(useWakeTargetStore.getState().alarmIds).toEqual([]);
  });

  test('schedules alarms even when session is active (preserving snooze)', async () => {
    let uuidCounter = 0;
    mockGenerateUUID.mockImplementation(() => `alarm-${++uuidCounter}`);
    const target = createTarget();
    useWakeTargetStore.setState({ target, loaded: true, alarmIds: ['old-wake-1'] });
    useMorningSessionStore.setState({
      session: {
        recordId: 'rec-1',
        date: '2026-03-06',
        startedAt: '2026-03-06T07:00:00.000Z',
        todos: [{ id: 'todo-1', title: 'Test', completed: false, completedAt: null }],
        windowEnd: '2026-03-06T07:30:00.000Z',
        liveActivityId: null,
        goalDeadline: null,
        snoozeAlarmIds: ['snooze-1'],
        snoozeFiresAt: '2026-03-06T07:09:00.000Z',
      },
      loaded: true,
    });

    await runEffect(syncAlarmsEffect);

    // セッションアクティブ中でも wake-target はスケジュールされる
    expect(mockScheduleRepeatingAlarm).toHaveBeenCalled();
    // 新しい alarmIds がストアに保存される
    expect(useWakeTargetStore.getState().alarmIds.length).toBeGreaterThan(0);
  });

  test('does nothing when store is not loaded yet', async () => {
    useWakeTargetStore.setState({ target: null, loaded: false });

    await runEffect(syncAlarmsEffect);

    expect(mockCancelAlarm).not.toHaveBeenCalled();
    expect(mockScheduleRepeatingAlarm).not.toHaveBeenCalled();
  });
});
