import * as Notifications from 'expo-notifications';
import i18n from '@/i18n';
import type { AlarmTime, DayOfWeek } from '../types/alarm';
import type { WakeTarget } from '../types/wake-target';
import { resolveTimeForDate } from '../types/wake-target';

/** Number of repeated notifications per alarm trigger */
export const REPEAT_COUNT = 5;
/** Interval between repeated notifications in seconds */
export const REPEAT_INTERVAL_SECONDS = 30;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') {
    return true;
  }
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

function buildCalendarTrigger(
  time: AlarmTime,
  weekday?: number,
  second?: number,
): Notifications.NotificationTriggerInput {
  const trigger: Record<string, unknown> = {
    type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
    hour: time.hour,
    minute: time.minute,
    second: second ?? 0,
    repeats: weekday !== undefined,
  };
  if (weekday !== undefined) {
    trigger.weekday = weekday;
  }
  return trigger as Notifications.NotificationTriggerInput;
}

function dayOfWeekToCalendarWeekday(day: DayOfWeek): number {
  // iOS calendar: 1=Sunday, 2=Monday, ..., 7=Saturday
  return day + 1;
}

export async function cancelAlarmNotifications(notificationIds: readonly string[]): Promise<void> {
  const cancellations = notificationIds.map((id) =>
    Notifications.cancelScheduledNotificationAsync(id),
  );
  await Promise.all(cancellations);
}

export async function scheduleWakeTargetNotifications(
  target: WakeTarget,
  existingIds: readonly string[],
): Promise<readonly string[]> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return [];

  await cancelAlarmNotifications(existingIds);

  const ids: string[] = [];
  const content: Notifications.NotificationContentInput = {
    title: i18n.t('alarm:notification.title'),
    body: i18n.t('alarm:notification.defaultBody'),
    sound: 'alarm-notification.wav',
    data: { wakeTarget: true },
  };

  // Schedule for each day of the week based on resolved time
  for (let day = 0; day < 7; day++) {
    const dayOfWeek = day as DayOfWeek;
    // Create a date for this weekday to resolve the time
    const testDate = new Date();
    testDate.setDate(testDate.getDate() + ((dayOfWeek - testDate.getDay() + 7) % 7));
    const time = resolveTimeForDate(target, testDate);

    if (time === null) continue; // Day is OFF

    const baseCalendarWeekday = dayOfWeekToCalendarWeekday(dayOfWeek);
    for (let i = 0; i < REPEAT_COUNT; i++) {
      const baseSeconds = time.hour * 3600 + time.minute * 60;
      const offsetSeconds = baseSeconds + i * REPEAT_INTERVAL_SECONDS;
      const triggerHour = Math.floor(offsetSeconds / 3600) % 24;
      const triggerMinute = Math.floor((offsetSeconds % 3600) / 60);
      const triggerSecond = offsetSeconds % 60;
      // Adjust weekday if offset crosses midnight
      const dayOverflow = Math.floor(offsetSeconds / 86400);
      const adjustedWeekday = ((baseCalendarWeekday - 1 + dayOverflow) % 7) + 1;
      const id = await Notifications.scheduleNotificationAsync({
        content,
        trigger: buildCalendarTrigger(
          { hour: triggerHour, minute: triggerMinute },
          adjustedWeekday,
          triggerSecond,
        ),
      });
      ids.push(id);
    }
  }

  // If nextOverride exists, also schedule one-time notifications
  if (target.nextOverride !== null) {
    const overrideTime = target.nextOverride.time;
    for (let i = 0; i < REPEAT_COUNT; i++) {
      const baseSeconds = overrideTime.hour * 3600 + overrideTime.minute * 60;
      const offsetSeconds = baseSeconds + i * REPEAT_INTERVAL_SECONDS;
      const triggerHour = Math.floor(offsetSeconds / 3600) % 24;
      const triggerMinute = Math.floor((offsetSeconds % 3600) / 60);
      const triggerSecond = offsetSeconds % 60;
      const id = await Notifications.scheduleNotificationAsync({
        content,
        trigger: buildCalendarTrigger(
          { hour: triggerHour, minute: triggerMinute },
          undefined,
          triggerSecond,
        ),
      });
      ids.push(id);
    }
  }

  return ids;
}

export function addNotificationResponseListener(
  callback: () => void,
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (data?.wakeTarget === true || typeof data?.alarmId === 'string') {
      callback();
    }
  });
}

export function addNotificationReceivedListener(
  callback: () => void,
): Notifications.EventSubscription {
  return Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data;
    if (data?.wakeTarget === true || typeof data?.alarmId === 'string') {
      callback();
    }
  });
}
