/**
 * NotificationService の Web 用 no-op スタブ。
 *
 * expo-notifications は Web で一部機能が制限されるため、
 * 安全に no-op 実装を提供する。
 */

import { Context, Effect, Layer } from 'effect';
import type { NotificationError } from './errors';

export interface NotificationService {
  readonly schedule: (params: {
    identifier: string;
    title: string;
    body: string;
    seconds: number;
  }) => Effect.Effect<string, NotificationError>;
  readonly cancel: (identifier: string) => Effect.Effect<void, NotificationError>;
  readonly getAllScheduled: Effect.Effect<readonly { identifier: string }[], NotificationError>;
}

export class Notification extends Context.Tag('Notification')<
  Notification,
  NotificationService
>() {}

export const NotificationLive = Layer.succeed(
  Notification,
  Notification.of({
    schedule: (params) => Effect.succeed(params.identifier),
    cancel: (_identifier) => Effect.void,
    getAllScheduled: Effect.succeed([]),
  }),
);
