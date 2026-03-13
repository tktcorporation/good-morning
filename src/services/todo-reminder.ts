/**
 * TODO 未完了リマインド通知を管理するモジュール。
 *
 * 背景: スヌーズアラーム（AlarmKit）が iOS の制約で鳴らないケースがあるため、
 * expo-notifications のローカル通知をフォールバックとして使用する。
 * セッション開始時に複数のリマインド通知を先行スケジュールし、
 * TODO 全完了時にキャンセルする。
 *
 * AlarmKit のスヌーズとは独立して動作するため、
 * どちらかが失敗しても片方がユーザーに通知できる冗長構成。
 *
 * 呼び出し元:
 *   - session-lifecycle.ts: handleAlarmDismiss (スケジュール)
 *   - session-lifecycle.ts: onAllTodosCompleted (キャンセル)
 *   - session-lifecycle.ts: expireSessionIfNeeded (キャンセル)
 */

import * as Notifications from 'expo-notifications';

/** リマインド通知の識別子プレフィックス。キャンセル時にフィルタリングに使用。 */
const REMINDER_ID_PREFIX = 'todo-reminder-';

/**
 * リマインド通知の間隔（秒）。スヌーズと同じ 9 分間隔。
 * スヌーズアラームと同タイミングで通知することで、
 * どちらかが確実にユーザーに届くようにする。
 */
const REMINDER_INTERVAL_SECONDS = 540;

/** 先行スケジュールするリマインドの最大本数。9分 × 20 = 3時間分。 */
const REMINDER_MAX_COUNT = 20;

/**
 * TODO 未完了リマインド通知を先行スケジュールする。
 *
 * expo-notifications の TimeIntervalNotificationTrigger を使い、
 * baseTime からの相対秒数で通知をスケジュールする。
 * AlarmKit のスヌーズと同じ 9 分間隔で、TODO の残り件数を含むメッセージを表示。
 *
 * @param remainingCount 未完了 TODO の件数（通知メッセージに表示）
 * @param count スケジュールする本数（デフォルト REMINDER_MAX_COUNT）
 * @returns スケジュールに成功した通知 ID の配列
 */
export async function scheduleReminderNotifications(
  remainingCount: number,
  count: number = REMINDER_MAX_COUNT,
): Promise<readonly string[]> {
  const ids: string[] = [];

  for (let i = 1; i <= count; i++) {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        identifier: `${REMINDER_ID_PREFIX}${i}`,
        content: {
          title: 'Good Morning',
          body: `タスクがまだ ${remainingCount} 個残っています！`,
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: REMINDER_INTERVAL_SECONDS * i,
        },
      });
      ids.push(id);
    } catch {
      // 個別のスケジュール失敗はスキップして残りを続行
    }
  }

  return ids;
}

/**
 * スケジュール済みの TODO リマインド通知を全てキャンセルする。
 *
 * TODO 全完了時・セッション期限切れ時に呼ばれる。
 * REMINDER_ID_PREFIX でフィルタリングし、リマインド通知のみをキャンセル。
 * 他のローカル通知には影響しない。
 */
export async function cancelReminderNotifications(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const reminderIds = scheduled
      .filter((n) => n.identifier.startsWith(REMINDER_ID_PREFIX))
      .map((n) => n.identifier);

    await Promise.all(reminderIds.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  } catch {
    // キャンセル失敗は無視 — 通知は期限切れで自然消滅する
  }
}
