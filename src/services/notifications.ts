import * as Notifications from 'expo-notifications';
import i18n from '@/i18n';
import type { Alarm, AlarmTime, DayOfWeek } from '../types/alarm';
import type { WakeTarget } from '../types/wake-target';
import { resolveTimeForDate } from '../types/wake-target';

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
): Notifications.NotificationTriggerInput {
  const trigger: Record<string, unknown> = {
    type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
    hour: time.hour,
    minute: time.minute,
    second: 0,
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

export async function scheduleAlarmNotifications(alarm: Alarm): Promise<readonly string[]> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    return [];
  }

  // Cancel existing notifications for this alarm
  await cancelAlarmNotifications(alarm.notificationIds);

  const notificationContent: Notifications.NotificationContentInput = {
    title: i18n.t('alarm:notification.title'),
    body: alarm.label || i18n.t('alarm:notification.defaultBody'),
    sound: 'alarm.wav',
    data: { alarmId: alarm.id },
  };

  const ids: string[] = [];

  if (alarm.repeatDays.length === 0) {
    // One-time alarm
    const id = await Notifications.scheduleNotificationAsync({
      content: notificationContent,
      trigger: buildCalendarTrigger(alarm.time),
    });
    ids.push(id);
  } else {
    // Repeating alarm for each day
    for (const day of alarm.repeatDays) {
      const id = await Notifications.scheduleNotificationAsync({
        content: notificationContent,
        trigger: buildCalendarTrigger(alarm.time, dayOfWeekToCalendarWeekday(day)),
      });
      ids.push(id);
    }
  }

  return ids;
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
    sound: 'alarm.wav',
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

    const calendarWeekday = dayOfWeekToCalendarWeekday(dayOfWeek);
    const id = await Notifications.scheduleNotificationAsync({
      content,
      trigger: buildCalendarTrigger(time, calendarWeekday),
    });
    ids.push(id);
  }

  // If nextOverride exists, also schedule a one-time notification for tomorrow
  if (target.nextOverride !== null) {
    const id = await Notifications.scheduleNotificationAsync({
      content,
      trigger: buildCalendarTrigger(target.nextOverride.time),
    });
    ids.push(id);
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
