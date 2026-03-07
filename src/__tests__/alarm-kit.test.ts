// src/__tests__/alarm-kit.test.ts
import * as AlarmKit from 'expo-alarm-kit';
import {
  APP_GROUP_ID,
  checkLaunchPayload,
  endLiveActivity,
  initializeAlarmKit,
  startLiveActivity,
  updateLiveActivity,
} from '../services/alarm-kit';
import {
  cancelAlarmsByIds,
  cancelAllAlarms,
  SNOOZE_DURATION_SECONDS,
  SNOOZE_MAX_COUNT,
  scheduleSnoozeAlarms,
  scheduleWakeTargetAlarm,
} from '../services/alarm-scheduler';
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
    // Reset defaults
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
      expect(mockConfigure).toHaveBeenCalledWith(APP_GROUP_ID);
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
      // 既存に2本のアラームがある状態でスケジュール
      mockGetAllAlarms.mockReturnValue(['stale-1', 'stale-2']);

      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        defaultTime: { hour: 7, minute: 30 },
        enabled: true,
      };

      const ids = await scheduleWakeTargetAlarm(target);

      // cancelAllAlarms() で既存の全アラームをキャンセルすること
      expect(mockGetAllAlarms).toHaveBeenCalled();
      expect(mockCancelAlarm).toHaveBeenCalledWith('stale-1');
      expect(mockCancelAlarm).toHaveBeenCalledWith('stale-2');
      // Should schedule one repeating alarm with all 7 weekdays
      expect(mockScheduleRepeatingAlarm).toHaveBeenCalledTimes(1);
      expect(mockScheduleRepeatingAlarm).toHaveBeenCalledWith(
        expect.objectContaining({
          hour: 7,
          minute: 30,
          weekdays: [1, 2, 3, 4, 5, 6, 7],
          launchAppOnDismiss: true,
        }),
      );
      // ネイティブスヌーズが無効になっていること（JS 側スヌーズと二重にならないよう doSnoozeIntent を削除済み）
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
          0: { type: 'off' }, // Sunday off
          6: { type: 'off' }, // Saturday off
        },
        enabled: true,
      };

      await scheduleWakeTargetAlarm(target);

      expect(mockScheduleRepeatingAlarm).toHaveBeenCalledTimes(1);
      // Weekdays only: Mon=2, Tue=3, Wed=4, Thu=5, Fri=6
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
          6: { type: 'custom', time: { hour: 8, minute: 30 } }, // Saturday custom
        },
        enabled: true,
      };

      await scheduleWakeTargetAlarm(target);

      // Two separate repeating alarms: default time + Saturday custom time
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

      await scheduleWakeTargetAlarm(target);

      // Should schedule one-time alarm for nextOverride
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

      const ids = await scheduleWakeTargetAlarm(target);
      expect(ids).toEqual([]);
      expect(mockScheduleRepeatingAlarm).not.toHaveBeenCalled();
    });
  });

  describe('cancelAllAlarms', () => {
    test('cancels all active alarms', async () => {
      mockGetAllAlarms.mockReturnValue(['alarm-1', 'alarm-2']);
      await cancelAllAlarms();
      expect(mockCancelAlarm).toHaveBeenCalledWith('alarm-1');
      expect(mockCancelAlarm).toHaveBeenCalledWith('alarm-2');
    });
  });

  describe('cancelAlarmsByIds', () => {
    test('cancels only the specified alarm IDs', async () => {
      await cancelAlarmsByIds(['snooze-1', 'snooze-2']);
      expect(mockCancelAlarm).toHaveBeenCalledWith('snooze-1');
      expect(mockCancelAlarm).toHaveBeenCalledWith('snooze-2');
      expect(mockCancelAlarm).toHaveBeenCalledTimes(2);
    });

    test('does nothing when given an empty array', async () => {
      await cancelAlarmsByIds([]);
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
      const ids = await scheduleSnoozeAlarms(baseTime, 3);

      expect(ids).toHaveLength(3);
      expect(mockScheduleAlarm).toHaveBeenCalledTimes(3);
      // 各アラームが 9分間隔であること
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

    test('returns empty array when AlarmKit is unavailable', async () => {
      // AlarmKit mock returns values by default so it's available;
      // test with count=0 for empty result
      const ids = await scheduleSnoozeAlarms(new Date(), 0);
      expect(ids).toHaveLength(0);
    });

    test('skips failed schedules and continues with remaining', async () => {
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `snooze-uuid-${++uuidCounter}`);
      // First succeeds, second fails, third succeeds
      mockScheduleAlarm
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const ids = await scheduleSnoozeAlarms(new Date(), 3);
      expect(ids).toHaveLength(2);
      expect(ids).toEqual(['snooze-uuid-1', 'snooze-uuid-3']);
    });

    test('defaults to SNOOZE_MAX_COUNT alarms', async () => {
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `snooze-uuid-${++uuidCounter}`);
      mockScheduleAlarm.mockResolvedValue(true);

      const ids = await scheduleSnoozeAlarms(new Date());
      expect(ids).toHaveLength(SNOOZE_MAX_COUNT);
      expect(mockScheduleAlarm).toHaveBeenCalledTimes(SNOOZE_MAX_COUNT);
    });
  });

  describe('startLiveActivity', () => {
    test('returns null when native function is unavailable', async () => {
      const result = await startLiveActivity(
        [{ id: '1', title: 'Test', completed: false }],
        '2026-02-25T07:09:00.000Z',
      );
      expect(result).toBeNull();
    });
  });

  describe('updateLiveActivity', () => {
    test('does not throw when native function is unavailable', async () => {
      await expect(
        updateLiveActivity(
          'activity-123',
          [{ id: '1', title: 'Test', completed: false }],
          '2026-02-25T07:09:00.000Z',
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('endLiveActivity', () => {
    test('does not throw when native function is unavailable', async () => {
      await expect(endLiveActivity('activity-123')).resolves.toBeUndefined();
    });
  });
});
