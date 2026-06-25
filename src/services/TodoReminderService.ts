/**
 * TODO 未完了リマインド通知を Effect で記述したサービス。
 *
 * 背景: todo-reminder.ts が expo-notifications を直接呼び出し、
 * 個別の try-catch でエラーをスキップしていた。Effect 化により
 * Notification サービスへの依存が型で明示され、エラーが追跡される。
 *
 * 呼び出し元: SessionLifecycleService
 */

import { Effect } from 'effect';
import { SNOOZE_DURATION_SECONDS, SNOOZE_MAX_COUNT } from '../constants/alarm-timing';
import type { NotificationError } from './errors';
import { Notification } from './NotificationService';

const REMINDER_ID_PREFIX = 'todo-reminder-';

// リマインド通知はスヌーズアラームと同じケイデンス（9 分間隔・3 時間分）で発火し、
// 両者がズレないよう constants/alarm-timing の値を共有する。
const REMINDER_INTERVAL_SECONDS = SNOOZE_DURATION_SECONDS;
const REMINDER_MAX_COUNT = SNOOZE_MAX_COUNT;

/**
 * TODO 未完了リマインド通知を先行スケジュールする Effect。
 */
export const scheduleReminderNotifications = (
  remainingCount: number,
  count: number = REMINDER_MAX_COUNT,
): Effect.Effect<readonly string[], NotificationError, Notification> =>
  Effect.gen(function* () {
    const notif = yield* Notification;
    const ids: string[] = [];

    for (let i = 1; i <= count; i++) {
      const result = yield* Effect.either(
        notif.schedule({
          identifier: `${REMINDER_ID_PREFIX}${i}`,
          title: 'Good Morning',
          body: `タスクがまだ ${remainingCount} 個残っています！`,
          seconds: REMINDER_INTERVAL_SECONDS * i,
        }),
      );
      if (result._tag === 'Right') {
        ids.push(result.right);
      }
    }

    return ids;
  });

/**
 * スケジュール済みの TODO リマインド通知を全てキャンセルする Effect。
 */
export const cancelReminderNotifications: Effect.Effect<void, NotificationError, Notification> =
  Effect.gen(function* () {
    const notif = yield* Notification;
    const scheduled = yield* notif.getAllScheduled;
    const reminderIds = scheduled
      .filter((n) => n.identifier.startsWith(REMINDER_ID_PREFIX))
      .map((n) => n.identifier);

    yield* Effect.all(
      reminderIds.map((id) => notif.cancel(id)),
      { concurrency: 'unbounded' },
    );
  });
