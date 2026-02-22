import * as Notifications from 'expo-notifications';
import i18n from '@/i18n';
import type { Alarm, AlarmTime, DayOfWeek } from '../types/alarm';

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

export function addNotificationResponseListener(
  callback: (alarmId: string) => void,
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const alarmId = response.notification.request.content.data?.alarmId;
    if (typeof alarmId === 'string') {
      callback(alarmId);
    }
  });
}

export function addNotificationReceivedListener(
  callback: (alarmId: string) => void,
): Notifications.EventSubscription {
  return Notifications.addNotificationReceivedListener((notification) => {
    const alarmId = notification.request.content.data?.alarmId;
    if (typeof alarmId === 'string') {
      callback(alarmId);
    }
  });
}
