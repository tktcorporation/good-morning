// src/__tests__/alarm-kit.test.ts
import * as AlarmKit from 'expo-alarm-kit';
import {
  APP_GROUP_ID,
  cancelAllAlarms,
  cancelSnooze,
  checkLaunchPayload,
  endLiveActivity,
  initializeAlarmKit,
  SNOOZE_DURATION_SECONDS,
  scheduleSnooze,
  scheduleWakeTargetAlarm,
  startLiveActivity,
  updateLiveActivity,
} from '../services/alarm-kit';
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
    test('cancels existing alarms and schedules repeating alarm for enabled days', async () => {
      mockGetAllAlarms.mockReturnValue(['old-alarm-1']);
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);

      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        defaultTime: { hour: 7, minute: 30 },
        enabled: true,
      };

      const ids = await scheduleWakeTargetAlarm(target);

      // Should cancel the old alarm
      expect(mockCancelAlarm).toHaveBeenCalledWith('old-alarm-1');
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
        nextOverride: { time: { hour: 6, minute: 0 } },
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

  describe('scheduleSnooze', () => {
    test('schedules a one-time alarm with snooze payload', async () => {
      mockGenerateUUID.mockReturnValue('snooze-uuid-1');
      mockScheduleAlarm.mockResolvedValue(true);

      const result = await scheduleSnooze();
      expect(result).toBe('snooze-uuid-1');
      expect(mockScheduleAlarm).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'snooze-uuid-1',
          title: 'Good Morning',
          launchAppOnDismiss: true,
          dismissPayload: '{"isSnooze":true}',
        }),
      );
    });

    test('returns null when scheduling fails', async () => {
      mockGenerateUUID.mockReturnValue('snooze-uuid-2');
      mockScheduleAlarm.mockResolvedValue(false);
      const result = await scheduleSnooze();
      expect(result).toBeNull();
    });
  });

  describe('cancelSnooze', () => {
    test('cancels the alarm by id', async () => {
      mockCancelAlarm.mockResolvedValue(true);
      await cancelSnooze('snooze-uuid-1');
      expect(mockCancelAlarm).toHaveBeenCalledWith('snooze-uuid-1');
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
