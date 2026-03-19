/**
 * セッションのライフサイクルを Effect で記述したオーケストレーション層。
 *
 * 背景: session-lifecycle.ts は500行超の巨大モジュールで、
 * 複数のストアとサービスに跨る副作用を fire-and-forget で実行していた。
 * Effect 化により：
 * - 各操作の依存関係が型レベルで明示される
 * - エラーが伝播し、呼び出し元がハンドリング戦略を選択できる
 * - Effect.gen で処理フローが宣言的に記述される
 *
 * 設計: 各関数は Effect プログラムを返す。
 * 実行は呼び出し元が runEffect / runEffectFork で行う。
 */

import { Effect } from 'effect';
import { toAlarmKitSoundName } from '../../constants/alarm-sounds';
import { useMorningSessionStore } from '../../stores/morning-session-store';
import { useWakeRecordStore } from '../../stores/wake-record-store';
import { useWakeTargetStore } from '../../stores/wake-target-store';
import type { AlarmTime } from '../../types/alarm';
import type { MorningSession, SessionTodo } from '../../types/morning-session';
import type { WakeTodoRecord } from '../../types/wake-record';
import { calculateDiffMinutes, calculateWakeResult } from '../../types/wake-record';
import type { WakeTarget } from '../../types/wake-target';
import { resolveTimeForDate } from '../../types/wake-target';
import { getLogicalDateString } from '../../utils/date';
import { AlarmKit, type AlarmKitError } from './AlarmKitService';
import {
  cancelAlarmsByIds,
  SNOOZE_DURATION_SECONDS,
  scheduleSnoozeAlarms,
} from './AlarmSchedulerService';
import { syncAlarmsEffect } from './AlarmSyncService';
import type { NotificationError } from './errors';
import type { Notification } from './NotificationService';
import { cancelReminderNotifications, scheduleReminderNotifications } from './TodoReminderService';

// ─── セッションウィンドウ定数 ───────────────────────────────────────

const SESSION_WINDOW_BEFORE_MINUTES = 30;
const SESSION_WINDOW_AFTER_MINUTES = 30;

// ─── 型定義 ────────────────────────────────────────────────────

/** セッションライフサイクル操作で発生しうるエラーの union */
type SessionError = AlarmKitError | NotificationError;

/** handleAlarmDismiss のパラメータ */
export interface AlarmDismissParams {
  readonly target: WakeTarget;
  readonly resolvedTime: AlarmTime;
  readonly dismissTime: Date;
  readonly mountedAt: Date;
  readonly dayBoundaryHour: number;
}

// ─── 純粋関数 ──────────────────────────────────────────────────

function getSessionWindow(resolvedTime: AlarmTime, date: Date): { start: Date; end: Date } {
  const alarmDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    resolvedTime.hour,
    resolvedTime.minute,
    0,
  );
  const start = new Date(alarmDate.getTime() - SESSION_WINDOW_BEFORE_MINUTES * 60 * 1000);
  const end = new Date(alarmDate.getTime() + SESSION_WINDOW_AFTER_MINUTES * 60 * 1000);
  return { start, end };
}

function checkSessionWindow(
  now: Date,
  target: WakeTarget,
  dayBoundaryHour: number,
): { resolvedTime: AlarmTime; windowEnd: Date; dateStr: string } | null {
  if (!target.enabled || target.todos.length === 0) return null;

  const dateStr = getLogicalDateString(now, dayBoundaryHour);
  const logicalDate = new Date(`${dateStr}T12:00:00`);
  const resolvedTime = resolveTimeForDate(target, logicalDate);
  if (resolvedTime === null) return null;

  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];
  const baseDate = new Date(year, month - 1, day);
  const { start, end } = getSessionWindow(resolvedTime, baseDate);

  if (now.getTime() >= start.getTime() && now.getTime() < end.getTime()) {
    return { resolvedTime, windowEnd: end, dateStr };
  }
  return null;
}

function isSnoozePayload(payload: { payload: string | null } | null): boolean {
  if (payload === null || payload.payload === null) return false;
  try {
    const parsed = JSON.parse(payload.payload) as { isSnooze?: boolean };
    return parsed.isSnooze === true;
  } catch {
    return false;
  }
}

function isSnoozeEvent(event: { payload: string }): boolean {
  if (event.payload === '') return false;
  try {
    const parsed = JSON.parse(event.payload) as { isSnooze?: boolean };
    return parsed.isSnooze === true;
  } catch {
    return false;
  }
}

// ─── セッション自動開始 ─────────────────────────────────────────

/**
 * 時間ウィンドウに基づいてセッションを自動開始する Effect。
 */
const tryAutoStartSession = (
  target: WakeTarget,
  dayBoundaryHour: number,
): Effect.Effect<boolean, never> =>
  Effect.gen(function* () {
    const sessionStore = useMorningSessionStore.getState();

    if (sessionStore.isActive()) return false;

    const now = new Date();
    const windowInfo = checkSessionWindow(now, target, dayBoundaryHour);
    if (windowInfo === null) return false;

    const { records } = useWakeRecordStore.getState();
    const todayRecord = records.find((r) => r.date === windowInfo.dateStr);
    if (todayRecord?.todosCompleted) return false;

    const sessionTodos: readonly SessionTodo[] = target.todos.map((todo) => ({
      id: todo.id,
      title: todo.title,
      completed: false,
      completedAt: null,
    }));

    yield* Effect.promise(() =>
      sessionStore.startSession(
        windowInfo.dateStr,
        sessionTodos,
        null,
        windowInfo.windowEnd.toISOString(),
      ),
    );

    return true;
  });

// ─── セッション期限切れ処理 ────────────────────────────────────────

/**
 * セッションが期限切れの場合にクリーンアップする Effect。
 *
 * 処理順序:
 * 1. スヌーズアラームキャンセル
 * 2. リマインド通知キャンセル
 * 3. Live Activity 終了
 * 4. WakeRecord 更新
 * 5. セッションクリア
 * 6. アラーム再スケジュール
 */
const expireSessionIfNeeded: Effect.Effect<boolean, SessionError, AlarmKit | Notification> =
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
    yield* Effect.catchAll(cancelReminderNotifications, () => Effect.void);

    // 2. Live Activity 終了
    if (session.liveActivityId !== null) {
      yield* Effect.catchAll(kit.endLiveActivity(session.liveActivityId), () => Effect.void);
    }

    // 3. WakeRecord 更新
    const expireRecordId = session.recordId;
    if (expireRecordId !== null) {
      const now = new Date();
      const todoCompletionSeconds = Math.round(
        (now.getTime() - new Date(session.startedAt).getTime()) / 1000,
      );
      const todoRecords: readonly WakeTodoRecord[] = session.todos.map((todo, index) => ({
        id: todo.id,
        title: todo.title,
        completedAt: todo.completedAt,
        orderCompleted: todo.completed ? index + 1 : null,
      }));
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

// ─── アラーム dismiss 処理 ─────────────────────────────────────────

/**
 * アラーム dismiss 時の処理 Effect。
 *
 * WakeRecord を作成し、セッションにアラーム関連情報を付与。
 * スヌーズ、リマインド通知、Live Activity を開始する。
 */
export const handleAlarmDismissEffect = (
  params: AlarmDismissParams,
): Effect.Effect<void, SessionError, AlarmKit | Notification> =>
  Effect.gen(function* () {
    const { target, resolvedTime, dismissTime, mountedAt, dayBoundaryHour } = params;
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
      const nativeSnoozeIds = yield* kit.getSnoozeAlarmIds;
      let snoozeIds: readonly string[];
      if (nativeSnoozeIds.length > 0) {
        snoozeIds = nativeSnoozeIds;
        yield* kit.clearSnoozeAlarmIds;
      } else {
        snoozeIds = yield* scheduleSnoozeAlarms(
          dismissTime,
          undefined,
          toAlarmKitSoundName(target.soundId),
        );
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
        title: td.title,
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

// ─── TODO 全完了時の処理 ──────────────────────────────────────────

/**
 * TODO 全完了時の処理 Effect。
 * スヌーズ・LA を停止し、WakeRecord を更新する。セッション自体はクリアしない。
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
      const todoRecords: readonly WakeTodoRecord[] = session.todos.map((todo, index) => ({
        id: todo.id,
        title: todo.title,
        completedAt: todo.completedAt,
        orderCompleted: todo.completed ? index + 1 : null,
      }));

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

// ─── セッション復元 ─────────────────────────────────────────────

/**
 * アプリ起動時にセッション状態を復元・クリーンアップする Effect。
 */
const restoreSessionOnLaunch = (
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

// ─── スヌーズ ──────────────────────────────────────────────────

/**
 * スヌーズアラーム発火時の処理 Effect。
 * Live Activity のカウントダウンを更新する。
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
            title: t.title,
            completed: t.completed,
          })),
          Math.floor(new Date(nextSnoozeFiresAt).getTime() / 1000),
        )
        .pipe(Effect.catchAll(() => Effect.void));
    }

    return true;
  });

// ─── ネイティブ dismiss 復元 ───────────────────────────────────────

/**
 * ネイティブ dismiss イベントを確認し、未処理のものから WakeRecord + セッションを復元する Effect。
 */
const recoverMissedDismiss = (
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

// ─── 統一エントリポイント ──────────────────────────────────────────

/**
 * アラームイベント（cold-start / foreground-resume）を統一処理する Effect。
 *
 * 従来の handleAlarmEvent と同等だが、全副作用が Effect として型追跡される。
 */
export const handleAlarmEventEffect = (
  context: 'cold-start' | 'foreground-resume',
  opts: {
    routerPush: (path: string) => void;
    dayBoundaryHour: number;
    clearExpiredOverride?: () => void;
  },
): Effect.Effect<void, SessionError, AlarmKit | Notification> =>
  Effect.gen(function* () {
    const { routerPush, dayBoundaryHour, clearExpiredOverride } = opts;
    const kit = yield* AlarmKit;
    const payload = yield* kit.checkLaunchPayload;

    if (payload !== null) {
      if (isSnoozePayload(payload)) {
        yield* handleSnoozeArrivalEffect;
        routerPush('/');
      } else {
        if (context === 'cold-start') {
          yield* restoreSessionOnLaunch(dayBoundaryHour);
        }
        const recovered = yield* recoverMissedDismiss(dayBoundaryHour);
        if (!recovered) {
          routerPush('/wakeup');
        }
      }
      return;
    }

    if (context === 'cold-start') {
      yield* restoreSessionOnLaunch(dayBoundaryHour);
      clearExpiredOverride?.();
    } else {
      yield* expireSessionIfNeeded;
    }

    const recovered = yield* recoverMissedDismiss(dayBoundaryHour);
    if (recovered) {
      routerPush('/');
      return;
    }

    const { target } = useWakeTargetStore.getState();
    if (target !== null) {
      yield* tryAutoStartSession(target, dayBoundaryHour);
    }
  });
