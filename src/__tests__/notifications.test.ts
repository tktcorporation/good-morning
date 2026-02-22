import * as Notifications from 'expo-notifications';
import {
  cancelAlarmNotifications,
  REPEAT_COUNT,
  REPEAT_INTERVAL_SECONDS,
  scheduleWakeTargetNotifications,
} from '../services/notifications';
import type { WakeTarget } from '../types/wake-target';
import { DEFAULT_WAKE_TARGET } from '../types/wake-target';

const mockSchedule = Notifications.scheduleNotificationAsync as jest.Mock;
const mockCancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;
const mockGetPermissions = Notifications.getPermissionsAsync as jest.Mock;

describe('notifications', () => {
  let idCounter: number;

  beforeEach(() => {
    jest.clearAllMocks();
    idCounter = 0;
    mockSchedule.mockImplementation(() => {
      idCounter += 1;
      return Promise.resolve(`notif-${idCounter}`);
    });
    mockGetPermissions.mockResolvedValue({ status: 'granted' });
  });

  describe('scheduleWakeTargetNotifications', () => {
    test('schedules REPEAT_COUNT notifications per active day (7 days x 5 = 35)', async () => {
      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        dayOverrides: {},
        nextOverride: null,
      };

      const ids = await scheduleWakeTargetNotifications(target, []);

      // 7 days * 5 repeats = 35
      expect(ids).toHaveLength(7 * REPEAT_COUNT);
      expect(mockSchedule).toHaveBeenCalledTimes(7 * REPEAT_COUNT);
    });

    test('schedules extra notifications for nextOverride (7x5 + 1x5 = 40)', async () => {
      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        dayOverrides: {},
        nextOverride: { time: { hour: 6, minute: 0 } },
      };

      const ids = await scheduleWakeTargetNotifications(target, []);

      // nextOverride replaces all day times via resolveTimeForDate,
      // so we get 7 days * 5 repeats + 1 override * 5 repeats = 40
      expect(ids).toHaveLength(7 * REPEAT_COUNT + REPEAT_COUNT);
      expect(mockSchedule).toHaveBeenCalledTimes(40);
    });

    test('cancels existing notifications before scheduling', async () => {
      const existingIds = ['old-1', 'old-2', 'old-3'];
      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        dayOverrides: {},
        nextOverride: null,
      };

      await scheduleWakeTargetNotifications(target, existingIds);

      expect(mockCancel).toHaveBeenCalledTimes(3);
      expect(mockCancel).toHaveBeenCalledWith('old-1');
      expect(mockCancel).toHaveBeenCalledWith('old-2');
      expect(mockCancel).toHaveBeenCalledWith('old-3');
    });

    test('notification content uses alarm-notification.wav sound', async () => {
      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        dayOverrides: {},
        nextOverride: null,
      };

      await scheduleWakeTargetNotifications(target, []);

      const firstCall = mockSchedule.mock.calls[0] as unknown[];
      const callArg = firstCall[0] as { content: { sound: string } };
      expect(callArg.content.sound).toBe('alarm-notification.wav');
    });

    test('skips days that are OFF (dayOverride type: off)', async () => {
      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        dayOverrides: {
          0: { type: 'off' }, // Sunday off
          6: { type: 'off' }, // Saturday off
        },
        nextOverride: null,
      };

      const ids = await scheduleWakeTargetNotifications(target, []);

      // 5 active days * 5 repeats = 25
      expect(ids).toHaveLength(5 * REPEAT_COUNT);
      expect(mockSchedule).toHaveBeenCalledTimes(25);
    });

    test('schedules notifications at correct 30-second intervals', async () => {
      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        defaultTime: { hour: 7, minute: 0 },
        dayOverrides: {
          // Turn off all days except Sunday (day 0)
          1: { type: 'off' },
          2: { type: 'off' },
          3: { type: 'off' },
          4: { type: 'off' },
          5: { type: 'off' },
          6: { type: 'off' },
        },
        nextOverride: null,
      };

      await scheduleWakeTargetNotifications(target, []);

      // Only Sunday active: 1 day * 5 repeats = 5
      expect(mockSchedule).toHaveBeenCalledTimes(REPEAT_COUNT);

      // Verify each call has the correct offset seconds
      for (let i = 0; i < REPEAT_COUNT; i++) {
        const call = mockSchedule.mock.calls[i] as unknown[];
        const callArg = call[0] as { trigger: { second: number; hour: number; minute: number } };
        const expectedOffset = i * REPEAT_INTERVAL_SECONDS;
        const expectedSecond = expectedOffset % 60;
        const expectedMinute = Math.floor(((7 * 3600 + expectedOffset) % 3600) / 60);
        const expectedHour = Math.floor((7 * 3600 + expectedOffset) / 3600) % 24;
        expect(callArg.trigger.second).toBe(expectedSecond);
        expect(callArg.trigger.minute).toBe(expectedMinute);
        expect(callArg.trigger.hour).toBe(expectedHour);
      }
    });

    test('returns empty array when permissions not granted', async () => {
      mockGetPermissions.mockResolvedValue({ status: 'denied' });
      const mockRequestPermissions = Notifications.requestPermissionsAsync as jest.Mock;
      mockRequestPermissions.mockResolvedValue({ status: 'denied' });

      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        dayOverrides: {},
        nextOverride: null,
      };

      const ids = await scheduleWakeTargetNotifications(target, []);

      expect(ids).toHaveLength(0);
      expect(mockSchedule).not.toHaveBeenCalled();
    });
  });

  describe('cancelAlarmNotifications', () => {
    test('cancels all given notification ids', async () => {
      const ids = ['id-1', 'id-2', 'id-3', 'id-4'];

      await cancelAlarmNotifications(ids);

      expect(mockCancel).toHaveBeenCalledTimes(4);
      expect(mockCancel).toHaveBeenCalledWith('id-1');
      expect(mockCancel).toHaveBeenCalledWith('id-2');
      expect(mockCancel).toHaveBeenCalledWith('id-3');
      expect(mockCancel).toHaveBeenCalledWith('id-4');
    });

    test('handles empty array', async () => {
      await cancelAlarmNotifications([]);

      expect(mockCancel).not.toHaveBeenCalled();
    });
  });

  describe('constants', () => {
    test('REPEAT_COUNT is 5', () => {
      expect(REPEAT_COUNT).toBe(5);
    });

    test('REPEAT_INTERVAL_SECONDS is 30', () => {
      expect(REPEAT_INTERVAL_SECONDS).toBe(30);
    });
  });
});
