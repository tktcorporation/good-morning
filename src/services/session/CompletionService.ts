/**
 * セッション完了・期限切れの処理。
 *
 * 背景: セッションが終わる2つのパターンを管理する。
 * 1. TODO全完了 → スヌーズ/LA停止、WakeRecord更新（セッション自体はウィンドウ終了まで維持）
 * 2. ウィンドウ期限切れ → 全リソースクリーンアップ＋セッション破棄
 *
 * 依存関係: types.ts（定数・型）
 * 呼び出し元: app/(tabs)/index.tsx (TODO完了), AlarmEventRouter (期限切れチェック)
 */

import { Effect } from 'effect';
import { useMorningSessionStore } from '../../stores/morning-session-store';
import { useWakeRecordStore } from '../../stores/wake-record-store';
import type { MorningSession } from '../../types/morning-session';
import { AlarmKit } from '../AlarmKitService';
import { cancelAlarmsByIds } from '../AlarmSchedulerService';
import { syncAlarmsEffect } from '../AlarmSyncService';
import type { Notification } from '../NotificationService';
import { cancelReminderNotifications } from '../TodoReminderService';
import { type SessionError, toWakeTodoRecords } from './types';

/**
 * TODO 全完了時の処理 Effect。
 * スヌーズ・LA を停止し、WakeRecord を更新する。セッション自体はクリアしない。
 *
 * 設計: セッションをクリアしないのはウィンドウベース管理のため。
 * ウィンドウ終了時に expireSessionIfNeeded が最終クリーンアップを行う。
 */
export const onAllTodosCompletedEffect = (
  session: MorningSession,
): Effect.Effect<void, SessionError, AlarmKit | Notification> =>
  Effect.gen(function* () {
    const now = new Date();
    const kit = yield* AlarmKit;

    // 1. スヌーズアラームキャンセル
    if (session.snoozeAlarmIds.length > 0) {
      yield* cancelAlarmsByIds(session.snoozeAlarmIds);
      yield* Effect.promise(() => useMorningSessionStore.getState().setSnoozeState([], null));
    }

    // 1.5. リマインド通知キャンセル
    yield* cancelReminderNotifications.pipe(Effect.catchAll(() => Effect.void));

    // 2. Live Activity 終了
    if (session.liveActivityId !== null) {
      yield* kit.endLiveActivity(session.liveActivityId).pipe(Effect.catchAll(() => Effect.void));
      yield* Effect.promise(() => useMorningSessionStore.getState().setLiveActivityId(null));
    }

    // 3. WakeRecord 更新
    const completedRecordId = session.recordId;
    if (completedRecordId !== null) {
      const todoCompletionSeconds = Math.round(
        (now.getTime() - new Date(session.startedAt).getTime()) / 1000,
      );
      const todoRecords = toWakeTodoRecords(session.todos);

      const goalBasedResult =
        session.goalDeadline !== null
          ? now.getTime() <= new Date(session.goalDeadline).getTime()
            ? ('great' as const)
            : ('late' as const)
          : undefined;

      yield* Effect.promise(() =>
        useWakeRecordStore.getState().updateRecord(completedRecordId, {
          todosCompleted: true,
          todosCompletedAt: now.toISOString(),
          todoCompletionSeconds,
          todos: todoRecords,
          ...(goalBasedResult !== undefined ? { result: goalBasedResult } : {}),
        }),
      ).pipe(Effect.catchAll(() => Effect.void));
    }
  });

/**
 * セッションが期限切れ（windowEnd 超過）の場合にクリーンアップする Effect。
 *
 * 処理順序:
 * 1. スヌーズアラームキャンセル → 2. リマインド通知キャンセル
 * → 3. Live Activity 終了 → 4. WakeRecord 更新
 * → 5. セッションクリア → 6. アラーム再スケジュール
 *
 * @returns true if session was expired and cleaned up
 */
export const expireSessionIfNeeded: Effect.Effect<boolean, SessionError, AlarmKit | Notification> =
  Effect.gen(function* () {
    const sessionStore = useMorningSessionStore.getState();
    if (!(sessionStore.isActive() && sessionStore.isExpired())) return false;

    const session = sessionStore.session;
    if (session === null) return false;

    const kit = yield* AlarmKit;

    // 1. スヌーズアラームキャンセル
    if (session.snoozeAlarmIds.length > 0) {
      yield* cancelAlarmsByIds(session.snoozeAlarmIds);
    }

    // 1.5. リマインド通知キャンセル
    yield* cancelReminderNotifications.pipe(Effect.catchAll(() => Effect.void));

    // 2. Live Activity 終了
    if (session.liveActivityId !== null) {
      yield* kit.endLiveActivity(session.liveActivityId).pipe(Effect.catchAll(() => Effect.void));
    }

    // 3. WakeRecord 更新
    const expireRecordId = session.recordId;
    if (expireRecordId !== null) {
      const now = new Date();
      const todoCompletionSeconds = Math.round(
        (now.getTime() - new Date(session.startedAt).getTime()) / 1000,
      );
      const todoRecords = toWakeTodoRecords(session.todos);
      const allCompleted = session.todos.every((t) => t.completed);

      yield* Effect.promise(() =>
        useWakeRecordStore.getState().updateRecord(expireRecordId, {
          todosCompleted: allCompleted,
          todosCompletedAt: allCompleted ? now.toISOString() : null,
          todoCompletionSeconds,
          todos: todoRecords,
        }),
      ).pipe(Effect.catchAll(() => Effect.void));
    }

    // 4. セッションクリア
    yield* Effect.promise(() => sessionStore.clearSession());

    // 5. アラーム再スケジュール
    yield* syncAlarmsEffect;

    return true;
  });
