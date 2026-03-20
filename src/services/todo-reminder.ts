/**
 * @deprecated Effect 版 (TodoReminderService) に移行済み。
 * このファイルはレガシーテスト (session-lifecycle.test.ts) が
 * session-lifecycle.ts 経由で間接的に依存しているため残存。
 * テストを Effect 版に移行次第、session-lifecycle.ts と共に削除予定。
 */

import * as Notifications from 'expo-notifications';

const REMINDER_ID_PREFIX = 'todo-reminder-';
const REMINDER_INTERVAL_SECONDS = 540;
const REMINDER_MAX_COUNT = 20;

export async function scheduleReminderNotifications(
  remainingCount: number,
  count: number = REMINDER_MAX_COUNT,
): Promise<void> {
  for (let i = 1; i <= count; i++) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `${REMINDER_ID_PREFIX}${i}`,
        content: {
          title: 'Good Morning',
          body: `${remainingCount} TODO remaining`,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: REMINDER_INTERVAL_SECONDS * i,
        },
      });
    } catch {
      // 個別の失敗は無視して残りを続行
    }
  }
}

export async function cancelReminderNotifications(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const reminderIds = scheduled
      .filter((n) => n.identifier.startsWith(REMINDER_ID_PREFIX))
      .map((n) => n.identifier);
    await Promise.all(reminderIds.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  } catch {
    // no-op
  }
}
