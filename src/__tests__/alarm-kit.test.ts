// src/__tests__/alarm-kit.test.ts

// Mock expo-alarm-kit before imports
const mockConfigure = jest.fn().mockReturnValue(true);
const mockRequestAuthorization = jest.fn().mockResolvedValue('authorized');
const mockScheduleRepeatingAlarm = jest.fn().mockResolvedValue(true);
const mockScheduleAlarm = jest.fn().mockResolvedValue(true);
const mockCancelAlarm = jest.fn().mockResolvedValue(true);
const mockGetAllAlarms = jest.fn().mockReturnValue([]);
const mockGenerateUUID = jest.fn().mockReturnValue('test-uuid-1');
const mockGetLaunchPayload = jest.fn().mockReturnValue(null);

jest.mock('expo-alarm-kit', () => ({
  configure: mockConfigure,
  requestAuthorization: mockRequestAuthorization,
  scheduleRepeatingAlarm: mockScheduleRepeatingAlarm,
  scheduleAlarm: mockScheduleAlarm,
  cancelAlarm: mockCancelAlarm,
  getAllAlarms: mockGetAllAlarms,
  generateUUID: mockGenerateUUID,
  getLaunchPayload: mockGetLaunchPayload,
}));

import type { DayOfWeek } from '../types/alarm';
import type { WakeTarget } from '../types/wake-target';
import { DEFAULT_WAKE_TARGET } from '../types/wake-target';
import {
  APP_GROUP_ID,
  cancelAllAlarms,
  checkLaunchPayload,
  initializeAlarmKit,
  scheduleWakeTargetAlarm,
} from '../services/alarm-kit';

describe('alarm-kit service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      // Generate unique UUIDs for each call
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
          0: { type: 'off' },  // Sunday off
          6: { type: 'off' },  // Saturday off
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
          6: { type: 'custom', time: { hour: 8, minute: 30 } },  // Saturday custom
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
});
