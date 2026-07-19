/**
 * アラーム dismiss 時の処理。
 *
 * 背景: ユーザーがアラームを dismiss した瞬間に実行される最も重要なフロー。
 * WakeRecord を作成し、セッションにアラーム情報を紐づけ、
 * スヌーズ・リマインド通知・Live Activity を開始する。
 *
 * 依存関係: types.ts（定数・型）
 * 呼び出し元: AlarmEventRouter (dismiss 処理), RecoveryService (recoverMissedDismiss)
 */

import { Effect } from 'effect';
import { useMorningSessionStore } from '../../stores/morning-session-store';
import { useWakeRecordStore } from '../../stores/wake-record-store';
import type { SessionTodo } from '../../types/morning-session';
import type { WakeTodoRecord } from '../../types/wake-record';
import { calculateDiffMinutes, calculateWakeResult } from '../../types/wake-record';
import { getLogicalDateString } from '../../utils/date';
import { getLocalizedTodoTitle } from '../../utils/todo-display';
import { AlarmKit } from '../AlarmKitService';
import { SNOOZE_DURATION_SECONDS, scheduleSnoozeAlarms } from '../AlarmSchedulerService';
import type { Notification } from '../NotificationService';
import { scheduleReminderNotifications } from '../TodoReminderService';
import { type AlarmDismissParams, SESSION_WINDOW_AFTER_MINUTES, type SessionError } from './types';

/**
 * アラーム dismiss 時の処理 Effect。
 *
 * WakeRecord を作成し、セッションにアラーム関連情報を付与。
 * スヌーズ、リマインド通知、Live Activity を開始する。
 *
 * 設計: スヌーズ/LA/リマインドの各ステップは失敗してもセッション自体は有効に保つ。
 * これにより、ネイティブモジュールの部分的な障害が朝ルーティン全体を壊さない。
 */
export const handleAlarmDismissEffect = (
  params: AlarmDismissParams,
): Effect.Effect<void, SessionError, AlarmKit | Notification> =>
  Effect.gen(function* () {
    const { target, resolvedTime, dismissTime, mountedAt, dayBoundaryHour } = params;

    // WakeRecord の永続化はメモリ上の records 配列全体を書き戻す実装のため、
    // records が未ロード（空配列のまま）の状態で addRecord すると、
    // 既存の起床履歴全体が新規レコード 1 件で上書きされる。
    // session も同様: 未ロードだと isActive()（session !== null）が false
    // になり、実際には進行中セッションが永続化されているのに startSession
    // が新規セッションで上書き保存してしまう。
    // ロードが完了していない場合は履歴・セッションを壊すより処理を諦める方が安全。
    if (!(useWakeRecordStore.getState().loaded && useMorningSessionStore.getState().loaded)) {
      return;
    }

    const kit = yield* AlarmKit;

    const hasTodos = target.todos.length > 0;
    const dateStr = getLogicalDateString(dismissTime, dayBoundaryHour);
    const diffMinutes = calculateDiffMinutes(resolvedTime, dismissTime);
    const result = calculateWakeResult(diffMinutes);

    const todoRecords: readonly WakeTodoRecord[] = target.todos.map((todo) => ({
      id: todo.id,
      title: todo.title,
      completedAt: null,
      orderCompleted: null,
      type: todo.type,
    }));

    const goalDeadline = hasTodos
      ? new Date(
          dismissTime.getFullYear(),
          dismissTime.getMonth(),
          dismissTime.getDate(),
          resolvedTime.hour,
          resolvedTime.minute + target.wakeUpGoalBufferMinutes,
          0,
        ).toISOString()
      : null;

    // 1. WakeRecord 作成
    const record = yield* Effect.promise(() =>
      useWakeRecordStore.getState().addRecord({
        alarmId: 'wake-target',
        date: dateStr,
        targetTime: resolvedTime,
        alarmTriggeredAt: mountedAt.toISOString(),
        dismissedAt: dismissTime.toISOString(),
        healthKitWakeTime: null,
        result,
        diffMinutes,
        todos: todoRecords,
        todoCompletionSeconds: 0,
        alarmLabel: '',
        todosCompleted: !hasTodos,
        todosCompletedAt: hasTodos ? null : dismissTime.toISOString(),
        goalDeadline,
      }),
    );

    if (!hasTodos) return;

    // 2. セッション紐づけ or 新規作成
    const sessionStore = useMorningSessionStore.getState();

    if (sessionStore.isActive()) {
      yield* Effect.promise(() => sessionStore.setRecordId(record.id));
      yield* Effect.promise(() => sessionStore.setGoalDeadline(goalDeadline));
    } else {
      const sessionTodos: readonly SessionTodo[] = target.todos.map((todo) => ({
        id: todo.id,
        title: todo.title,
        completed: false,
        completedAt: null,
        type: todo.type,
        requiredCount: todo.requiredCount,
        currentCount: 0,
      }));
      const windowEnd = new Date(
        dismissTime.getTime() + SESSION_WINDOW_AFTER_MINUTES * 60 * 1000,
      ).toISOString();
      yield* Effect.promise(() =>
        sessionStore.startSession(dateStr, sessionTodos, goalDeadline, windowEnd),
      );
      yield* Effect.promise(() => useMorningSessionStore.getState().setRecordId(record.id));
    }

    // 3. スヌーズスケジュール（失敗してもセッションは有効に保つ）
    yield* Effect.gen(function* () {
      let snoozeIds: readonly string[] = [];
      const nativeSnoozeIds = yield* kit.getSnoozeAlarmIds;
      if (nativeSnoozeIds.length > 0) {
        // 取り込み前に別経路の syncAlarms が孤立キャンセルで消している可能性が
        // あるため、ネイティブ台帳と突合して生存している ID だけ採用する。
        // 死んだ ID を採用すると Live Activity はカウントダウンを表示するのに
        // 9 分後に何も鳴らない
        const registered = new Set(yield* kit.getAllAlarms);
        snoozeIds = nativeSnoozeIds.filter((id) => registered.has(id));
        yield* kit.clearSnoozeAlarmIds;
      }
      if (snoozeIds.length === 0) {
        snoozeIds = yield* scheduleSnoozeAlarms(dismissTime);
      }
      const snoozeFiresAt = new Date(
        dismissTime.getTime() + SNOOZE_DURATION_SECONDS * 1000,
      ).toISOString();
      yield* Effect.promise(() =>
        useMorningSessionStore.getState().setSnoozeState(snoozeIds, snoozeFiresAt),
      );
    }).pipe(Effect.catchAll(() => Effect.void));

    // 4. リマインド通知（失敗してもセッションは有効に保つ）
    yield* scheduleReminderNotifications(target.todos.length).pipe(
      Effect.catchAll(() => Effect.void),
    );

    // 5. Live Activity 開始（失敗してもセッションは有効に保つ）
    yield* Effect.gen(function* () {
      const { session: currentSession } = useMorningSessionStore.getState();
      const liveActivityTodos = target.todos.map((td) => ({
        id: td.id,
        title: getLocalizedTodoTitle(td),
        completed: false,
      }));
      const activityId = yield* kit.startLiveActivity(
        liveActivityTodos,
        currentSession?.snoozeFiresAt
          ? Math.floor(new Date(currentSession.snoozeFiresAt).getTime() / 1000)
          : null,
      );
      if (activityId !== null) {
        yield* Effect.promise(() =>
          useMorningSessionStore.getState().setLiveActivityId(activityId),
        );
      }
    }).pipe(Effect.catchAll(() => Effect.void));
  });
