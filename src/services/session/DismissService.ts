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
import { useSettingsStore } from '../../stores/settings-store';
import { useWakeRecordStore } from '../../stores/wake-record-store';
import type { AlarmTime } from '../../types/alarm';
import type { SessionTodo } from '../../types/morning-session';
import type { WakeRecord, WakeTodoRecord } from '../../types/wake-record';
import { calculateDiffMinutes, calculateWakeResult } from '../../types/wake-record';
import { resolveDismissDateStr, type WakeTarget } from '../../types/wake-target';
import { getLocalizedTodoTitle } from '../../utils/todo-display';
import { AlarmKit } from '../AlarmKitService';
import {
  nextSnoozeFireTime,
  SNOOZE_DURATION_SECONDS,
  scheduleSnoozeAlarms,
} from '../AlarmSchedulerService';
import { bestEffort } from '../effect-utils';
import type { Notification } from '../NotificationService';
import { scheduleReminderNotifications } from '../TodoReminderService';
import { type AlarmDismissParams, SESSION_WINDOW_AFTER_MINUTES, type SessionError } from './types';

/** recordWakeDismiss の戻り値。呼び出し元がセッション紐づけの要否を判断するための情報を含む。 */
interface WakeDismissRecord {
  readonly record: WakeRecord;
  readonly goalDeadline: string | null;
  readonly hasTodos: boolean;
}

/**
 * dismiss を WakeRecord として記録する Effect（セッション・スヌーズには触れない）。
 *
 * 複数の未処理 dismiss イベントを遡って処理する場面（recoverMissedDismiss）で、
 * 古い日のイベントにもセッション開始・スヌーズ取り込みを行うと、ライブセッション
 * の日付が古いイベントのものになり、ネイティブ App Groups のスヌーズ（最新
 * イベントのものに上書きされている）が古い日付のセッションに誤って紐づく。
 * この関数は履歴レコードの作成だけを行い、セッション/スヌーズは呼び出し元
 * （最新イベントの処理）に一任する。
 */
export const recordWakeDismiss = (
  target: WakeTarget,
  alarmInstant: Date,
  dismissTime: Date,
  mountedAt: Date,
  dateStr: string,
): Effect.Effect<WakeDismissRecord, never> =>
  Effect.gen(function* () {
    const resolvedTime: AlarmTime = {
      hour: alarmInstant.getHours(),
      minute: alarmInstant.getMinutes(),
    };
    const hasTodos = target.todos.length > 0;
    const diffMinutes = calculateDiffMinutes(resolvedTime, dismissTime);
    const result = calculateWakeResult(diffMinutes);

    const todoRecords: readonly WakeTodoRecord[] = target.todos.map((todo) => ({
      id: todo.id,
      title: todo.title,
      completedAt: null,
      orderCompleted: null,
      type: todo.type,
    }));

    // alarmInstant（実際に発火した日時）を基準にする。dismissTime の暦日を
    // 使うと、深夜またぎで前日の override が採用されたケースで締め切りが
    // 1 日ズレる
    const goalDeadline = hasTodos
      ? new Date(
          alarmInstant.getFullYear(),
          alarmInstant.getMonth(),
          alarmInstant.getDate(),
          alarmInstant.getHours(),
          alarmInstant.getMinutes() + target.wakeUpGoalBufferMinutes,
          0,
        ).toISOString()
      : null;

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

    return { record, goalDeadline, hasTodos };
  });

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
    const { target, alarmInstant, dismissTime, mountedAt, dayBoundaryHour } = params;

    // WakeRecord の永続化はメモリ上の records 配列全体を書き戻す実装のため、
    // records が未ロード（空配列のまま）の状態で addRecord すると、
    // 既存の起床履歴全体が新規レコード 1 件で上書きされる。
    // session も同様: 未ロードだと isActive()（session !== null）が false
    // になり、実際には進行中セッションが永続化されているのに startSession
    // が新規セッションで上書き保存してしまう。settings も同様: 未ロードだと
    // dayBoundaryHour がデフォルト値のままになり、誤った論理日付で
    // record/session が作成・紐づけされる。
    // ロードが完了していない場合は履歴・セッションを壊すより処理を諦める方が安全。
    if (
      !(
        useWakeRecordStore.getState().loaded &&
        useMorningSessionStore.getState().loaded &&
        useSettingsStore.getState().loaded
      )
    ) {
      return;
    }

    const kit = yield* AlarmKit;
    const dateStr = resolveDismissDateStr(alarmInstant, dismissTime, target, dayBoundaryHour);

    // 1. WakeRecord 作成
    const { record, goalDeadline, hasTodos } = yield* recordWakeDismiss(
      target,
      alarmInstant,
      dismissTime,
      mountedAt,
      dateStr,
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
    yield* bestEffort(
      Effect.gen(function* () {
        let snoozeIds: readonly string[] = [];
        // 生存している中で最も早いスヌーズの発火時刻。null なら未確定
        // （JS フォールバック側で nextSnoozeFireTime から算出する）
        let firstFireAt: Date | null = null;
        const nativeSnoozeIds = yield* kit.getSnoozeAlarmIds;
        if (nativeSnoozeIds.length > 0) {
          // 取り込み前に別経路の syncAlarms が孤立キャンセルで消している可能性が
          // あるため、ネイティブ台帳と突合して生存している ID だけ採用する。
          // 死んだ ID を採用すると Live Activity はカウントダウンを表示するのに
          // 9 分後に何も鳴らない。
          // ネイティブ側は 1..N 番目を発火順に生成・保存しているため、配列内の
          // 元インデックスは「何分後のスヌーズか」を表す。先頭からいくつか
          // 既に発火・キャンセル済みで消えていることがあり、生存突合後の先頭を
          // 「9 分後」固定で扱うと、実際より早い時刻をカウントダウン表示する
          const registered = new Set(yield* kit.getAllAlarms);
          const firstSurvivingIndex = nativeSnoozeIds.findIndex((id) => registered.has(id));
          snoozeIds = nativeSnoozeIds.filter((id) => registered.has(id));
          yield* kit.clearSnoozeAlarmIds;
          if (firstSurvivingIndex >= 0) {
            firstFireAt = new Date(
              dismissTime.getTime() + SNOOZE_DURATION_SECONDS * 1000 * (firstSurvivingIndex + 1),
            );
          }
        }
        if (snoozeIds.length === 0) {
          snoozeIds = yield* scheduleSnoozeAlarms(dismissTime);
          // 遅延リカバリで全 20 本が過去時刻になっていた等、実際には
          // 1 本も登録できなかった場合は null のままにする。理論上の未来値を
          // 入れると、実在しないスヌーズへ Live Activity がカウントダウンする
          firstFireAt = snoozeIds.length > 0 ? nextSnoozeFireTime(dismissTime) : null;
        }
        const snoozeFiresAt = firstFireAt?.toISOString() ?? null;
        yield* Effect.promise(() =>
          useMorningSessionStore.getState().setSnoozeState(snoozeIds, snoozeFiresAt),
        );
      }),
    );

    // 4. リマインド通知（失敗してもセッションは有効に保つ）
    yield* bestEffort(scheduleReminderNotifications(target.todos.length));

    // 5. Live Activity 開始（失敗してもセッションは有効に保つ）
    yield* bestEffort(
      Effect.gen(function* () {
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
      }),
    );
  });
