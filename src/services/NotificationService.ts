/**
 * expo-notifications を抽象化する Effect サービス。
 *
 * 背景: todo-reminder.ts が expo-notifications を直接呼び出し、
 * 個別の try-catch でエラーを握り潰していた。
 * Effect サービスとして定義することで、エラーが NotificationError として型追跡される。
 *
 * 呼び出し元: SessionLifecycleService（スヌーズリマインド通知のスケジュール/キャンセル）
 */

import { Context, Effect, Layer } from 'effect';
import * as Notifications from 'expo-notifications';
import { NotificationError } from './errors';

// ─── サービスインターフェース ────────────────────────────────────

export interface NotificationService {
  /** 指定秒後にローカル通知をスケジュール */
  readonly schedule: (params: {
    identifier: string;
    title: string;
    body: string;
    seconds: number;
  }) => Effect.Effect<string, NotificationError>;

  /** 指定 ID の通知をキャンセル */
  readonly cancel: (identifier: string) => Effect.Effect<void, NotificationError>;

  /** スケジュール済み通知の一覧を取得 */
  readonly getAllScheduled: Effect.Effect<readonly { identifier: string }[], NotificationError>;
}

export class Notification extends Context.Tag('Notification')<
  Notification,
  NotificationService
>() {}

// ─── expo-notifications 実装 Layer ──────────────────────────────

export const NotificationLive = Layer.succeed(
  Notification,
  Notification.of({
    schedule: (params) =>
      Effect.tryPromise({
        try: () =>
          Notifications.scheduleNotificationAsync({
            identifier: params.identifier,
            content: {
              title: params.title,
              body: params.body,
              sound: 'default',
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: params.seconds,
            },
          }),
        catch: (cause) => new NotificationError({ operation: 'schedule', cause }),
      }),

    cancel: (identifier) =>
      Effect.tryPromise({
        try: () => Notifications.cancelScheduledNotificationAsync(identifier),
        catch: (cause) => new NotificationError({ operation: 'cancel', cause }),
      }),

    getAllScheduled: Effect.tryPromise({
      try: () => Notifications.getAllScheduledNotificationsAsync(),
      catch: (cause) => new NotificationError({ operation: 'list', cause }),
    }),
  }),
);
