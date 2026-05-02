/**
 * セッション復元・回復の処理。
 *
 * 背景: iOS ではアラーム dismiss 時にアプリが起動しない場合がある。
 * アプリ起動時に以下の回復処理を行う:
 * 1. 期限切れセッションのクリーンアップ
 * 2. 別日のstaleセッションの破棄
 * 3. ネイティブ dismiss イベントからの WakeRecord + セッション復元
 * 4. スヌーズアラーム到着時の Live Activity 更新
 *
 * 依存関係: types.ts, DismissService.ts, CompletionService.ts
 * 呼び出し元: AlarmEventRouter (handleAlarmEventEffect)
 */

import { Effect } from 'effect';
import { useMorningSessionStore } from '../../stores/morning-session-store';
import { useWakeRecordStore } from '../../stores/wake-record-store';
import { useWakeTargetStore } from '../../stores/wake-target-store';
import { resolveTimeForDate } from '../../types/wake-target';
import { getLogicalDateString } from '../../utils/date';
import { getLocalizedTodoTitle } from '../../utils/todo-display';
import { AlarmKit, type AlarmKitError } from '../AlarmKitService';
import { SNOOZE_DURATION_SECONDS } from '../AlarmSchedulerService';
import type { Notification } from '../NotificationService';
import { expireSessionIfNeeded } from './CompletionService';
import { handleAlarmDismissEffect } from './DismissService';
import { isSnoozeEvent, type SessionError } from './types';

/**
 * アプリ起動時にセッション状態を復元・クリーンアップする Effect。
 *
 * - 期限切れセッション → expireSessionIfNeeded に委譲
 * - 別日のセッション → stale として破棄（Live Activity も終了）
 * - 当日の完了済みセッション → dangling Live Activity を回収
 */
export const restoreSessionOnLaunch = (
  dayBoundaryHour: number,
): Effect.Effect<void, SessionError, AlarmKit | Notification> =>
  Effect.gen(function* () {
    const expired = yield* expireSessionIfNeeded;
    if (expired) return;

    const state = useMorningSessionStore.getState();
    if (state.session === null) return;

    const kit = yield* AlarmKit;
    const today = getLogicalDateString(new Date(), dayBoundaryHour);

    if (state.session.date !== today) {
      if (state.session.liveActivityId !== null) {
        yield* kit
          .endLiveActivity(state.session.liveActivityId)
          .pipe(Effect.catchAll(() => Effect.void));
      }
      yield* Effect.promise(() => state.clearSession());
      return;
    }

    if (state.areAllCompleted() && state.session.liveActivityId !== null) {
      yield* kit
        .endLiveActivity(state.session.liveActivityId)
        .pipe(Effect.catchAll(() => Effect.void));
    }
  });

/**
 * ネイティブ dismiss イベントを確認し、未処理のものから
 * WakeRecord + セッション情報を復元する Effect。
 *
 * @returns true if a session was recovered, false otherwise
 */
export const recoverMissedDismiss = (
  dayBoundaryHour: number,
): Effect.Effect<boolean, SessionError, AlarmKit | Notification> =>
  Effect.gen(function* () {
    const kit = yield* AlarmKit;

    if (useMorningSessionStore.getState().isActive()) {
      yield* kit.clearDismissEvents;
      return false;
    }

    const events = yield* kit.getDismissEvents;
    if (events.length === 0) return false;

    const primaryEvents = events.filter((e) => !isSnoozeEvent(e));
    if (primaryEvents.length === 0) {
      yield* kit.clearDismissEvents;
      return false;
    }

    // primaryEvents.length > 0 は上のガードで保証済み
    const event = primaryEvents[primaryEvents.length - 1] as (typeof primaryEvents)[number];
    const dismissTime = new Date(event.dismissedAt);
    const dateStr = getLogicalDateString(dismissTime, dayBoundaryHour);

    const { records } = useWakeRecordStore.getState();
    if (records.some((r) => r.date === dateStr)) {
      yield* kit.clearDismissEvents;
      return false;
    }

    const { target } = useWakeTargetStore.getState();
    if (target === null) {
      yield* kit.clearDismissEvents;
      return false;
    }

    const resolvedTime = resolveTimeForDate(target, dismissTime);
    if (resolvedTime === null) {
      yield* kit.clearDismissEvents;
      return false;
    }

    yield* handleAlarmDismissEffect({
      target,
      resolvedTime,
      dismissTime,
      mountedAt: dismissTime,
      dayBoundaryHour,
    });

    yield* kit.clearDismissEvents;
    return true;
  });

/**
 * スヌーズアラーム発火時の処理 Effect。
 * Live Activity のカウントダウンを次のスヌーズ時刻に更新する。
 *
 * @returns true if session is active with incomplete todos, false otherwise
 */
export const handleSnoozeArrivalEffect: Effect.Effect<boolean, AlarmKitError, AlarmKit> =
  Effect.gen(function* () {
    const sessionState = useMorningSessionStore.getState();
    if (sessionState.session === null || sessionState.areAllCompleted()) {
      return false;
    }

    const kit = yield* AlarmKit;
    const nextSnoozeFiresAt = new Date(Date.now() + SNOOZE_DURATION_SECONDS * 1000).toISOString();
    useMorningSessionStore.getState().setSnoozeFiresAt(nextSnoozeFiresAt);

    const activityId = sessionState.session.liveActivityId;
    if (activityId !== null) {
      yield* kit
        .updateLiveActivity(
          activityId,
          sessionState.session.todos.map((t) => ({
            id: t.id,
            title: getLocalizedTodoTitle(t),
            completed: t.completed,
          })),
          Math.floor(new Date(nextSnoozeFiresAt).getTime() / 1000),
        )
        .pipe(Effect.catchAll(() => Effect.void));
    }

    return true;
  });
