/**
 * セッションのライフサイクル操作を一元管理するオーケストレーション層。
 *
 * 設計変更（2026-03）: セッションをアラーム発火から独立させた。
 * セッションは「時間ウィンドウ」で管理され、アラーム時刻 ± N分 のウィンドウ内であれば
 * アラーム発火の成否に関わらず自動開始される。TODO全完了後もウィンドウ終了まで維持する。
 *
 * 責務分離:
 * - セッション: 朝ルーティンの時間ウィンドウ管理、TODO追跡
 * - アラーム: 通知・音・振動（セッション開始のトリガーの一つ）
 * - スヌーズ/LA: アラーム dismiss 後の付加機能（セッション必須ではない）
 *
 * 設計: docs/plans/2026-03-01-session-lifecycle-service-design.md
 */

import { toAlarmKitSoundName } from '../constants/alarm-sounds';
import { useMorningSessionStore } from '../stores/morning-session-store';
import { useWakeRecordStore } from '../stores/wake-record-store';
import { useWakeTargetStore } from '../stores/wake-target-store';
import type { AlarmTime } from '../types/alarm';
import type { MorningSession, SessionTodo } from '../types/morning-session';
import type { WakeTodoRecord } from '../types/wake-record';
import { calculateDiffMinutes, calculateWakeResult } from '../types/wake-record';
import type { WakeTarget } from '../types/wake-target';
import { resolveTimeForDate } from '../types/wake-target';
import { getLogicalDateString } from '../utils/date';
import {
  checkLaunchPayload,
  clearDismissEvents,
  clearSnoozeAlarmIds,
  getDismissEvents,
  getSnoozeAlarmIds,
  type NativeDismissEvent,
} from './alarm-kit';
import {
  cancelAlarmsByIds,
  SNOOZE_DURATION_SECONDS,
  scheduleSnoozeAlarms,
  scheduleWakeTargetAlarm,
} from './alarm-scheduler';
import { syncAlarms } from './alarm-sync';
import { endLiveActivity, startLiveActivity, updateLiveActivity } from './live-activity';
import { cancelReminderNotifications, scheduleReminderNotifications } from './todo-reminder';

// ─── セッションウィンドウ定数 ───────────────────────────────────────
/**
 * セッションはアラーム時刻の何分前に開始するか。
 * 例: アラーム 9:30、BEFORE=30 → セッション開始 9:00
 */
export const SESSION_WINDOW_BEFORE_MINUTES = 30;

/**
 * セッションはアラーム時刻の何分後まで維持するか。
 * 例: アラーム 9:30、AFTER=30 → セッション終了 10:00
 * TODO全完了後もこの時刻まで維持される。
 */
export const SESSION_WINDOW_AFTER_MINUTES = 30;

// ─── セッションウィンドウ計算 ──────────────────────────────────────

/**
 * アラーム時刻からセッションウィンドウ（開始・終了）を算出する純粋関数。
 *
 * @param resolvedTime 曜日オーバーライド適用後のアラーム時刻
 * @param date ウィンドウを算出する日付（論理日付ベース）
 * @returns windowStart, windowEnd の Date ペア
 */
export function getSessionWindow(resolvedTime: AlarmTime, date: Date): { start: Date; end: Date } {
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

/**
 * 現在時刻がセッションウィンドウ内かどうかを判定する。
 * セッション自動開始の判定に使用。
 *
 * @returns ウィンドウ内ならセッション情報、そうでなければ null
 */
export function checkSessionWindow(
  now: Date,
  target: WakeTarget,
  dayBoundaryHour: number,
): { resolvedTime: AlarmTime; windowEnd: Date; dateStr: string } | null {
  if (!target.enabled || target.todos.length === 0) return null;

  // 論理日付から当日のアラーム時刻を算出
  const dateStr = getLogicalDateString(now, dayBoundaryHour);
  const logicalDate = new Date(`${dateStr}T12:00:00`);
  const resolvedTime = resolveTimeForDate(target, logicalDate);
  if (resolvedTime === null) return null;

  // 論理日付をベースにウィンドウ計算
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];
  const baseDate = new Date(year, month - 1, day);
  const { start, end } = getSessionWindow(resolvedTime, baseDate);

  if (now.getTime() >= start.getTime() && now.getTime() < end.getTime()) {
    return { resolvedTime, windowEnd: end, dateStr };
  }
  return null;
}

// ─── セッション自動開始 ─────────────────────────────────────────

/**
 * 時間ウィンドウに基づいてセッションを自動開始する。
 * アラーム発火の成否に関わらず、ウィンドウ内であればセッションを作成する。
 *
 * セッション自動開始時は:
 * - WakeRecord は未作成（アラーム dismiss 時に作成）
 * - goalDeadline は null（dismiss 時に算出）
 * - スヌーズ/Live Activity は未開始（dismiss 時に開始）
 *
 * 呼び出し元: app/_layout.tsx（cold-start / foreground-resume）
 *
 * @returns true if session was auto-started
 */
export async function tryAutoStartSession(
  target: WakeTarget,
  dayBoundaryHour: number,
): Promise<boolean> {
  const sessionStore = useMorningSessionStore.getState();

  // 既にセッションがアクティブなら何もしない
  if (sessionStore.isActive()) return false;

  const now = new Date();
  const windowInfo = checkSessionWindow(now, target, dayBoundaryHour);
  if (windowInfo === null) return false;

  // 同日の WakeRecord が既にあり、TODO完了済みの場合はスキップ
  // （既に完了して期限切れになったセッションの再作成を防ぐ）
  const { records } = useWakeRecordStore.getState();
  const todayRecord = records.find((r) => r.date === windowInfo.dateStr);
  if (todayRecord?.todosCompleted) return false;

  const sessionTodos: readonly SessionTodo[] = target.todos.map((todo) => ({
    id: todo.id,
    title: todo.title,
    completed: false,
    completedAt: null,
  }));

  await sessionStore.startSession(
    windowInfo.dateStr,
    sessionTodos,
    null, // goalDeadline はアラーム dismiss 時に設定
    windowInfo.windowEnd.toISOString(),
  );

  return true;
}

// ─── セッション期限切れ処理 ────────────────────────────────────────

/**
 * セッションが期限切れ（windowEnd を超過）の場合にクリーンアップする。
 *
 * 処理順序:
 * 1. 残存スヌーズアラームをキャンセル（防御的）
 * 2. Live Activity を終了（防御的）
 * 3. WakeRecord が紐づいていて TODO 未完了なら結果を記録
 * 4. セッションクリア
 * 5. アラーム再スケジュール
 *
 * 呼び出し元: app/_layout.tsx（cold-start / foreground-resume）
 *
 * @returns true if session was expired and cleaned up
 */
export async function expireSessionIfNeeded(): Promise<boolean> {
  const sessionStore = useMorningSessionStore.getState();
  if (!(sessionStore.isActive() && sessionStore.isExpired())) return false;

  const session = sessionStore.session;
  if (session === null) return false;

  // 1. 残存スヌーズアラームをキャンセル
  if (session.snoozeAlarmIds.length > 0) {
    await cancelAlarmsByIds(session.snoozeAlarmIds);
  }

  // 1.5. 残存リマインド通知をキャンセル
  await cancelReminderNotifications();

  // 2. Live Activity を終了
  if (session.liveActivityId !== null) {
    await endLiveActivity(session.liveActivityId);
  }

  // 3. WakeRecord 更新（紐づいている場合のみ）
  if (session.recordId !== null) {
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
    const { updateRecord } = useWakeRecordStore.getState();
    try {
      await updateRecord(session.recordId, {
        todosCompleted: allCompleted,
        todosCompletedAt: allCompleted ? now.toISOString() : null,
        todoCompletionSeconds,
        todos: todoRecords,
      });
    } catch {
      // レコード更新失敗でもセッションはクリア
    }
  }

  // 4. セッションクリア
  await sessionStore.clearSession();

  // 5. アラーム再スケジュール
  await syncAlarms();

  return true;
}

// ─── アラーム dismiss 処理 ─────────────────────────────────────────

/**
 * handleAlarmDismiss に渡すパラメータ。
 * wakeup.tsx のアラーム dismiss ハンドラーから呼ばれる。
 */
export interface AlarmDismissParams {
  /** 現在有効な WakeTarget（TODO リスト含む） */
  readonly target: WakeTarget;
  /** 解決済みアラーム時刻（曜日オーバーライド適用後） */
  readonly resolvedTime: AlarmTime;
  /** ユーザーがアラームを dismiss した時刻 */
  readonly dismissTime: Date;
  /** wakeup 画面がマウントされた時刻（alarmTriggeredAt として記録） */
  readonly mountedAt: Date;
  /** 日付変更ラインの時刻（getLogicalDateString に渡す） */
  readonly dayBoundaryHour: number;
}

/**
 * アラーム dismiss 時の処理。WakeRecord を作成し、セッションにアラーム関連情報を付与する。
 *
 * セッションが既に自動開始されている場合:
 * - WakeRecord を作成してセッションに紐づけ
 * - goalDeadline を設定
 * - スヌーズと Live Activity を開始
 *
 * セッションが未開始の場合（ウィンドウ外での dismiss など）:
 * - WakeRecord を作成
 * - セッションを新規作成（TODO がある場合）
 * - スヌーズと Live Activity を開始
 *
 * 呼び出し元: app/wakeup.tsx (handleDismiss)
 */
export async function handleAlarmDismiss(params: AlarmDismissParams): Promise<void> {
  const { target, resolvedTime, dismissTime, mountedAt, dayBoundaryHour } = params;

  // 既存の wake-target アラームをキャンセル（スヌーズとの競合防止）
  const targetState = useWakeTargetStore.getState();
  if (targetState.alarmIds.length > 0) {
    await cancelAlarmsByIds(targetState.alarmIds);
    await targetState.setAlarmIds([]);
  }

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

  // 起床目標デッドライン: アラーム時刻 + wakeUpGoalBufferMinutes
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

  // 1. WakeRecord 作成（失敗時は throw）
  const { addRecord } = useWakeRecordStore.getState();
  const record = await addRecord({
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
  });

  if (!hasTodos) return;

  const sessionStore = useMorningSessionStore.getState();

  if (sessionStore.isActive()) {
    // セッション自動開始済み → recordId と goalDeadline を後から紐づけ
    await sessionStore.setRecordId(record.id);
    await sessionStore.setGoalDeadline(goalDeadline);
  } else {
    // セッション未開始 → 新規作成（ウィンドウ外での dismiss、または自動開始が動かなかったケース）
    const sessionTodos: readonly SessionTodo[] = target.todos.map((todo) => ({
      id: todo.id,
      title: todo.title,
      completed: false,
      completedAt: null,
    }));
    // ウィンドウ外なので、dismiss 時刻から SESSION_WINDOW_AFTER_MINUTES 分のウィンドウを設定
    const windowEnd = new Date(
      dismissTime.getTime() + SESSION_WINDOW_AFTER_MINUTES * 60 * 1000,
    ).toISOString();
    await sessionStore.startSession(dateStr, sessionTodos, goalDeadline, windowEnd);
    await sessionStore.setRecordId(record.id);
  }

  // 3. スヌーズスケジュール
  try {
    const nativeSnoozeIds = getSnoozeAlarmIds();
    let snoozeIds: readonly string[];
    if (nativeSnoozeIds.length > 0) {
      snoozeIds = nativeSnoozeIds;
      clearSnoozeAlarmIds();
    } else {
      // ネイティブ側がスケジュールしなかった場合のフォールバック。
      // ユーザー選択の音をスヌーズにも適用する。
      snoozeIds = await scheduleSnoozeAlarms(
        dismissTime,
        undefined,
        toAlarmKitSoundName(target.soundId),
      );
    }
    const snoozeFiresAt = new Date(
      dismissTime.getTime() + SNOOZE_DURATION_SECONDS * 1000,
    ).toISOString();
    await useMorningSessionStore.getState().setSnoozeState(snoozeIds, snoozeFiresAt);
  } catch {
    // スヌーズ失敗はログのみ — セッション自体は有効に保つ
  }

  // 4. TODO 未完了リマインド通知をスケジュール
  // スヌーズアラーム（AlarmKit）が iOS の制約で鳴らないケースの保険として、
  // expo-notifications のローカル通知でもリマインドする。
  try {
    await scheduleReminderNotifications(target.todos.length);
  } catch {
    // リマインド通知失敗はログのみ
  }

  // 5. Live Activity 開始
  try {
    const { session: currentSession } = useMorningSessionStore.getState();
    const liveActivityTodos = target.todos.map((td) => ({
      id: td.id,
      title: td.title,
      completed: false,
    }));
    const activityId = await startLiveActivity(
      liveActivityTodos,
      currentSession?.snoozeFiresAt ?? null,
    );
    if (activityId !== null) {
      await useMorningSessionStore.getState().setLiveActivityId(activityId);
    }
  } catch {
    // LA 失敗はログのみ — セッション自体は有効に保つ
  }
}

/**
 * 後方互換エイリアス。既存の呼び出し元（recoverMissedDismiss）から使用。
 * 新規コードでは handleAlarmDismiss を直接使うこと。
 */
export async function startMorningSession(params: StartSessionParams): Promise<void> {
  await handleAlarmDismiss(params);
}

/**
 * startMorningSession の旧パラメータ型。後方互換のため維持。
 */
export interface StartSessionParams {
  readonly target: WakeTarget;
  readonly resolvedTime: AlarmTime;
  readonly dismissTime: Date;
  readonly mountedAt: Date;
  readonly dayBoundaryHour: number;
}

// ─── TODO 全完了時の処理 ──────────────────────────────────────────

/**
 * TODO 全完了時の処理。スヌーズ・LA を停止し、WakeRecord を更新する。
 * セッション自体はクリアしない（ウィンドウ終了まで維持）。
 *
 * 旧 completeMorningSession との違い:
 * - セッションをクリアしない（ウィンドウベース管理のため）
 * - syncAlarms を呼ばない（セッションがまだ active のため）
 *
 * 呼び出し元: app/(tabs)/index.tsx (全TODO完了検知時)
 */
export async function onAllTodosCompleted(session: MorningSession): Promise<void> {
  const now = new Date();

  // 1. スヌーズアラームのみキャンセル（TODO完了したので不要）
  if (session.snoozeAlarmIds.length > 0) {
    await cancelAlarmsByIds(session.snoozeAlarmIds);
    // snoozeAlarmIds をクリアして永続化（再実行防止）
    await useMorningSessionStore.getState().setSnoozeState([], null);
  }

  // 1.5. リマインド通知もキャンセル（TODO完了したので不要）
  await cancelReminderNotifications();

  // 2. Live Activity 終了
  if (session.liveActivityId !== null) {
    await endLiveActivity(session.liveActivityId);
    await useMorningSessionStore.getState().setLiveActivityId(null);
  }

  // 3. WakeRecord 更新（recordId がある場合のみ）
  if (session.recordId !== null) {
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

    const { updateRecord } = useWakeRecordStore.getState();
    try {
      await updateRecord(session.recordId, {
        todosCompleted: true,
        todosCompletedAt: now.toISOString(),
        todoCompletionSeconds,
        todos: todoRecords,
        ...(goalBasedResult !== undefined ? { result: goalBasedResult } : {}),
      });
    } catch {
      // レコード更新失敗はログのみ
    }
  }

  // セッションはクリアしない — windowEnd まで維持される

  // 4. wake-target アラームを再スケジュール
  // handleAlarmDismiss で dismiss 時に repeating アラームを全キャンセルしているため、
  // TODO 完了時点で翌日以降のアラームが消失している。
  // syncAlarms() はセッション active 中は早期リターンするため、直接再スケジュールする。
  try {
    const { target } = useWakeTargetStore.getState();
    if (target?.enabled) {
      const newIds = await scheduleWakeTargetAlarm(target);
      await useWakeTargetStore.getState().setAlarmIds(newIds);
    }
  } catch {
    // アラーム再スケジュール失敗はログのみ — セッション期限切れ時にリトライされる
  }
}

/**
 * 後方互換エイリアス。
 * 旧: セッションクリア + syncAlarms を行っていた。
 * 新: TODO完了処理のみ行い、セッションは維持。
 *
 * 呼び出し元がまだ completeMorningSession を参照している場合のため残す。
 */
export async function completeMorningSession(session: MorningSession): Promise<void> {
  await onAllTodosCompleted(session);
}

// ─── セッション復元 ─────────────────────────────────────────────

/**
 * アプリ起動時にセッション状態を復元・クリーンアップする。
 *
 * - 期限切れセッション → expireSessionIfNeeded に委譲
 * - 別日のセッション → stale として破棄（Live Activity も終了）
 * - 当日の完了済みセッション → dangling Live Activity を回収
 * - 当日の未完了セッション → snoozeFiresAt が永続化済みなので何もしない
 *
 * 呼び出し元: app/_layout.tsx（初期化時）
 */
export async function restoreSessionOnLaunch(dayBoundaryHour: number): Promise<void> {
  // まず期限切れチェック（windowEnd 超過）
  const expired = await expireSessionIfNeeded();
  if (expired) return;

  const state = useMorningSessionStore.getState();
  if (state.session === null) return;

  const today = getLogicalDateString(new Date(), dayBoundaryHour);
  if (state.session.date !== today) {
    // 別日のセッションは stale — Live Activity を終了してクリア
    if (state.session.liveActivityId !== null) {
      endLiveActivity(state.session.liveActivityId);
    }
    state.clearSession();
    return;
  }

  // 当日の完了済みセッションで Live Activity が残っている場合は回収
  if (state.areAllCompleted() && state.session.liveActivityId !== null) {
    endLiveActivity(state.session.liveActivityId);
  }
}

// ─── スヌーズ ──────────────────────────────────────────────────

/**
 * スヌーズアラーム発火時の処理。再スケジュールは不要（先行スケジュール済み）。
 * Live Activity のカウントダウンを次のスヌーズ時刻に更新する。
 *
 * @returns true if session is active with incomplete todos, false otherwise
 */
export function handleSnoozeArrival(): boolean {
  const sessionState = useMorningSessionStore.getState();
  if (sessionState.session === null || sessionState.areAllCompleted()) {
    return false;
  }

  // 次のスヌーズ発火時刻を計算してストアに保存（カウントダウン表示用）
  const nextSnoozeFiresAt = new Date(Date.now() + SNOOZE_DURATION_SECONDS * 1000).toISOString();
  useMorningSessionStore.getState().setSnoozeFiresAt(nextSnoozeFiresAt);

  // Live Activity を更新（カウントダウン表示を次のスヌーズ時刻に）
  const activityId = sessionState.session.liveActivityId;
  if (activityId !== null) {
    updateLiveActivity(
      activityId,
      sessionState.session.todos.map((t) => ({
        id: t.id,
        title: t.title,
        completed: t.completed,
      })),
      nextSnoozeFiresAt,
    );
  }
  return true;
}

// ─── ネイティブ dismiss 復元 ───────────────────────────────────────

/**
 * アプリ起動時にネイティブ dismiss イベントを確認し、未処理のものから
 * WakeRecord + セッション情報を復元する。
 *
 * 背景: iOS ではアラーム dismiss 時にアプリが起動しない場合がある。
 * ネイティブ側が App Groups に記録した dismiss タイムスタンプを使い、
 * 正確な起床データを復元する。
 *
 * 呼び出し元: app/_layout.tsx（初期化時、通常起動 + バックグラウンド復帰時）
 *
 * @returns true if a session was recovered, false otherwise
 */
export async function recoverMissedDismiss(dayBoundaryHour: number): Promise<boolean> {
  // セッションが既にアクティブなら dismiss イベントだけクリアして終了
  if (useMorningSessionStore.getState().isActive()) {
    await clearDismissEvents();
    return false;
  }

  const events = await getDismissEvents();
  if (events.length === 0) return false;

  const primaryEvents = events.filter((e) => !isSnoozeEvent(e));
  if (primaryEvents.length === 0) {
    await clearDismissEvents();
    return false;
  }

  const event = primaryEvents[primaryEvents.length - 1] as NativeDismissEvent;
  const dismissTime = new Date(event.dismissedAt);
  const dateStr = getLogicalDateString(dismissTime, dayBoundaryHour);

  // 同日のレコードが既にある場合はスキップ
  const { records } = useWakeRecordStore.getState();
  if (records.some((r) => r.date === dateStr)) {
    await clearDismissEvents();
    return false;
  }

  const { target } = useWakeTargetStore.getState();
  if (target === null) {
    await clearDismissEvents();
    return false;
  }

  const resolvedTime = resolveTimeForDate(target, dismissTime);
  if (resolvedTime === null) {
    await clearDismissEvents();
    return false;
  }

  await handleAlarmDismiss({
    target,
    resolvedTime,
    dismissTime,
    mountedAt: dismissTime,
    dayBoundaryHour,
  });

  await clearDismissEvents();
  return true;
}

// ─── アラームイベント統一エントリポイント ──────────────────────────────

/**
 * アラームイベント（cold-start / foreground-resume）を統一処理するエントリポイント。
 *
 * 設計変更: セッション自動開始とセッション期限切れチェックを追加。
 * アラームペイロードの有無に関わらず、ウィンドウベースでセッションを管理する。
 *
 * 呼び出し元:
 * - app/_layout.tsx 初期化 effect (cold-start)
 * - app/_layout.tsx AppState listener (foreground-resume)
 */
export async function handleAlarmEvent(
  context: 'cold-start' | 'foreground-resume',
  opts: {
    routerPush: (path: string) => void;
    dayBoundaryHour: number;
    clearExpiredOverride?: () => void;
  },
): Promise<void> {
  const { routerPush, dayBoundaryHour, clearExpiredOverride } = opts;
  const payload = checkLaunchPayload();

  if (payload !== null) {
    if (isSnoozePayload(payload)) {
      handleSnoozeArrival();
      routerPush('/');
    } else {
      if (context === 'cold-start') {
        await restoreSessionOnLaunch(dayBoundaryHour);
      }
      const recovered = await recoverMissedDismiss(dayBoundaryHour);
      if (!recovered) {
        routerPush('/wakeup');
      }
    }
    return;
  }

  // ペイロードなし: アラーム経由でない起動または復帰。
  if (context === 'cold-start') {
    await restoreSessionOnLaunch(dayBoundaryHour);
    clearExpiredOverride?.();
  } else {
    // foreground-resume でも期限切れチェックを行う
    await expireSessionIfNeeded();
  }

  // ネイティブ dismiss イベントを確認
  const recovered = await recoverMissedDismiss(dayBoundaryHour);
  if (recovered) {
    routerPush('/');
    return;
  }

  // セッション自動開始を試みる
  const { target } = useWakeTargetStore.getState();
  if (target !== null) {
    await tryAutoStartSession(target, dayBoundaryHour);
  }
}

// ─── ユーティリティ ────────────────────────────────────────────

function isSnoozePayload(payload: { payload: string | null } | null): boolean {
  if (payload === null || payload.payload === null) return false;
  try {
    const parsed = JSON.parse(payload.payload) as { isSnooze?: boolean };
    return parsed.isSnooze === true;
  } catch {
    return false;
  }
}

function isSnoozeEvent(event: NativeDismissEvent): boolean {
  if (event.payload === '') return false;
  try {
    const parsed = JSON.parse(event.payload) as { isSnooze?: boolean };
    return parsed.isSnooze === true;
  } catch {
    return false;
  }
}
