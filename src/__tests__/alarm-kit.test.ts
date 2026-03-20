/**
 * AlarmKit サービス・スケジューラーのテスト。
 *
 * Effect 版のサービス（AlarmKitService, AlarmSchedulerService, compat.ts）を
 * runEffect() 経由でテストする。expo-alarm-kit は jest.setup.js でグローバルモック済み。
 */
import * as AlarmKit from 'expo-alarm-kit';
import {
  cancelAlarmsByIds,
  cancelAllAlarms,
  checkLaunchPayload,
  initializeAlarmKit,
  runEffect,
  SNOOZE_DURATION_SECONDS,
  SNOOZE_MAX_COUNT,
  scheduleSnoozeAlarms,
  scheduleWakeTargetAlarm,
} from '../services';
import type { WakeTarget } from '../types/wake-target';
import { DEFAULT_WAKE_TARGET } from '../types/wake-target';

const mockConfigure = AlarmKit.configure as jest.Mock;
const mockRequestAuthorization = AlarmKit.requestAuthorization as jest.Mock;
const mockScheduleRepeatingAlarm = AlarmKit.scheduleRepeatingAlarm as jest.Mock;
const mockScheduleAlarm = AlarmKit.scheduleAlarm as jest.Mock;
const mockCancelAlarm = AlarmKit.cancelAlarm as jest.Mock;
const mockGetAllAlarms = AlarmKit.getAllAlarms as jest.Mock;
const mockGenerateUUID = AlarmKit.generateUUID as jest.Mock;
const mockGetLaunchPayload = AlarmKit.getLaunchPayload as jest.Mock;

describe('alarm-kit service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfigure.mockReturnValue(true);
    mockRequestAuthorization.mockResolvedValue('authorized');
    mockScheduleRepeatingAlarm.mockResolvedValue(true);
    mockScheduleAlarm.mockResolvedValue(true);
    mockCancelAlarm.mockResolvedValue(true);
    mockGetAllAlarms.mockReturnValue([]);
    mockGenerateUUID.mockReturnValue('test-uuid-1');
    mockGetLaunchPayload.mockReturnValue(null);
  });

  describe('initializeAlarmKit', () => {
    test('calls configure with app group and requests authorization', async () => {
      const result = await initializeAlarmKit();
      expect(mockConfigure).toHaveBeenCalledWith('group.com.tktcorporation.goodmorning');
      expect(mockRequestAuthorization).toHaveBeenCalled();
      expect(result).toBe('authorized');
    });

    test('returns denied when configure fails', async () => {
      mockConfigure.mockReturnValueOnce(false);
      const result = await initializeAlarmKit();
      expect(result).toBe('denied');
      expect(mockRequestAuthorization).not.toHaveBeenCalled();
    });
  });

  describe('scheduleWakeTargetAlarm', () => {
    test('cancels all existing alarms before scheduling (孤立アラーム蓄積防止)', async () => {
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);
      mockGetAllAlarms.mockReturnValue(['stale-1', 'stale-2']);

      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        defaultTime: { hour: 7, minute: 30 },
        enabled: true,
      };

      const ids = await runEffect(scheduleWakeTargetAlarm(target, [], []));

      expect(mockGetAllAlarms).toHaveBeenCalled();
      expect(mockCancelAlarm).toHaveBeenCalledWith('stale-1');
      expect(mockCancelAlarm).toHaveBeenCalledWith('stale-2');
      expect(mockScheduleRepeatingAlarm).toHaveBeenCalledTimes(1);
      expect(mockScheduleRepeatingAlarm).toHaveBeenCalledWith(
        expect.objectContaining({
          hour: 7,
          minute: 30,
          weekdays: [1, 2, 3, 4, 5, 6, 7],
          launchAppOnDismiss: true,
        }),
      );
      const callArgs = mockScheduleRepeatingAlarm.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(callArgs?.doSnoozeIntent).toBeUndefined();
      expect(ids.length).toBe(1);
    });

    test('skips days that are set to off', async () => {
      mockGetAllAlarms.mockReturnValue([]);
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);

      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        defaultTime: { hour: 7, minute: 0 },
        dayOverrides: {
          0: { type: 'off' },
          6: { type: 'off' },
        },
        enabled: true,
      };

      await runEffect(scheduleWakeTargetAlarm(target, [], []));

      expect(mockScheduleRepeatingAlarm).toHaveBeenCalledTimes(1);
      expect(mockScheduleRepeatingAlarm).toHaveBeenCalledWith(
        expect.objectContaining({
          weekdays: [2, 3, 4, 5, 6],
        }),
      );
    });

    test('groups days by time and schedules separate alarms for different times', async () => {
      mockGetAllAlarms.mockReturnValue([]);
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);

      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        defaultTime: { hour: 7, minute: 0 },
        dayOverrides: {
          6: { type: 'custom', time: { hour: 8, minute: 30 } },
        },
        enabled: true,
      };

      await runEffect(scheduleWakeTargetAlarm(target, [], []));

      expect(mockScheduleRepeatingAlarm).toHaveBeenCalledTimes(2);
    });

    test('schedules one-time alarm for nextOverride', async () => {
      mockGetAllAlarms.mockReturnValue([]);
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);

      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        nextOverride: { time: { hour: 6, minute: 0 }, targetDate: '2099-12-31' },
        enabled: true,
      };

      await runEffect(scheduleWakeTargetAlarm(target, [], []));

      expect(mockScheduleAlarm).toHaveBeenCalledTimes(1);
      expect(mockScheduleAlarm).toHaveBeenCalledWith(
        expect.objectContaining({
          launchAppOnDismiss: true,
        }),
      );
    });

    test('returns empty array when target is disabled', async () => {
      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        enabled: false,
      };

      const ids = await runEffect(scheduleWakeTargetAlarm(target, [], []));
      expect(ids).toEqual([]);
      expect(mockScheduleRepeatingAlarm).not.toHaveBeenCalled();
    });
  });

  describe('cancelAllAlarms', () => {
    test('cancels all active alarms', async () => {
      mockGetAllAlarms.mockReturnValue(['alarm-1', 'alarm-2']);
      await runEffect(cancelAllAlarms);
      expect(mockCancelAlarm).toHaveBeenCalledWith('alarm-1');
      expect(mockCancelAlarm).toHaveBeenCalledWith('alarm-2');
    });
  });

  describe('cancelAlarmsByIds', () => {
    test('cancels only the specified alarm IDs', async () => {
      await runEffect(cancelAlarmsByIds(['snooze-1', 'snooze-2']));
      expect(mockCancelAlarm).toHaveBeenCalledWith('snooze-1');
      expect(mockCancelAlarm).toHaveBeenCalledWith('snooze-2');
      expect(mockCancelAlarm).toHaveBeenCalledTimes(2);
    });

    test('does nothing when given an empty array', async () => {
      await runEffect(cancelAlarmsByIds([]));
      expect(mockCancelAlarm).not.toHaveBeenCalled();
    });
  });

  describe('checkLaunchPayload', () => {
    test('returns null when no payload', () => {
      mockGetLaunchPayload.mockReturnValue(null);
      expect(checkLaunchPayload()).toBeNull();
    });

    test('returns payload when launched from alarm', () => {
      mockGetLaunchPayload.mockReturnValue({ alarmId: 'abc', payload: null });
      expect(checkLaunchPayload()).toEqual({ alarmId: 'abc', payload: null });
    });
  });

  describe('SNOOZE_DURATION_SECONDS', () => {
    test('is 540 seconds (9 minutes)', () => {
      expect(SNOOZE_DURATION_SECONDS).toBe(540);
    });
  });

  describe('SNOOZE_MAX_COUNT', () => {
    test('is 20 (9min × 20 = 3 hours)', () => {
      expect(SNOOZE_MAX_COUNT).toBe(20);
    });
  });

  describe('scheduleSnoozeAlarms', () => {
    test('schedules N alarms at 9-minute intervals with snooze payload', async () => {
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `snooze-uuid-${++uuidCounter}`);
      mockScheduleAlarm.mockResolvedValue(true);

      const baseTime = new Date('2026-02-28T07:00:00.000Z');
      const ids = await runEffect(scheduleSnoozeAlarms(baseTime, 3));

      expect(ids).toHaveLength(3);
      expect(mockScheduleAlarm).toHaveBeenCalledTimes(3);
      for (let i = 0; i < 3; i++) {
        const expectedEpoch = Math.floor(
          (baseTime.getTime() + SNOOZE_DURATION_SECONDS * 1000 * (i + 1)) / 1000,
        );
        expect(mockScheduleAlarm).toHaveBeenCalledWith(
          expect.objectContaining({
            id: `snooze-uuid-${i + 1}`,
            epochSeconds: expectedEpoch,
            title: 'Good Morning',
            launchAppOnDismiss: true,
            dismissPayload: '{"isSnooze":true}',
          }),
        );
      }
    });

    test('returns empty array when count is 0', async () => {
      const ids = await runEffect(scheduleSnoozeAlarms(new Date(), 0));
      expect(ids).toHaveLength(0);
    });

    test('skips failed schedules and continues with remaining', async () => {
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `snooze-uuid-${++uuidCounter}`);
      mockScheduleAlarm
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const ids = await runEffect(scheduleSnoozeAlarms(new Date(), 3));
      expect(ids).toHaveLength(2);
      expect(ids).toEqual(['snooze-uuid-1', 'snooze-uuid-3']);
    });

    test('defaults to SNOOZE_MAX_COUNT alarms', async () => {
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `snooze-uuid-${++uuidCounter}`);
      mockScheduleAlarm.mockResolvedValue(true);

      const ids = await runEffect(scheduleSnoozeAlarms(new Date()));
      expect(ids).toHaveLength(SNOOZE_MAX_COUNT);
      expect(mockScheduleAlarm).toHaveBeenCalledTimes(SNOOZE_MAX_COUNT);
    });
  });
});
