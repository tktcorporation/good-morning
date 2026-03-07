/**
 * セッションのライフサイクル操作を一元管理するオーケストレーション層。
 *
 * 背景: セッション操作が wakeup.tsx（開始）→ index.tsx（完了）→ _layout.tsx（復元）に
 * 散在していたため、全操作をこのモジュールに集約した。各関数が alarm-kit, stores を
 * 協調させ、コンポーネントは1行の呼び出しで済む。
 *
 * 設計: docs/plans/2026-03-01-session-lifecycle-service-design.md
 */

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
  getDismissEvents,
  type NativeDismissEvent,
} from './alarm-kit';
import {
  cancelAlarmsByIds,
  SNOOZE_DURATION_SECONDS,
  scheduleSnoozeAlarms,
} from './alarm-scheduler';
import { syncAlarms } from './alarm-sync';
import { endLiveActivity, startLiveActivity, updateLiveActivity } from './live-activity';

/**
 * startMorningSession に渡すパラメータ。
 * wakeup.tsx のアラーム dismiss ハンドラーから呼ばれる。
 */
export interface StartSessionParams {
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
 * アラーム dismiss 時にセッションを開始する。
 *
 * 処理順序:
 * 1. WakeRecord 作成（失敗時は throw — 記録なしで続行するのは危険）
 * 2. MorningSession 作成（TODO がある場合のみ）
 * 3. スヌーズアラーム先行スケジュール（失敗してもセッション続行）
 * 4. Live Activity 開始（失敗してもセッション続行）
 *
 * 呼び出し元: app/wakeup.tsx (handleDismiss)
 */
export async function startMorningSession(params: StartSessionParams): Promise<void> {
  const { target, resolvedTime, dismissTime, mountedAt, dayBoundaryHour } = params;

  // セッション開始前に既存の wake-target アラームをキャンセルする。
  // スヌーズアラームスケジュール後に cancelAllAlarms が走る競合を防ぐ。
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

  // 2. セッション作成
  const sessionTodos: readonly SessionTodo[] = target.todos.map((todo) => ({
    id: todo.id,
    title: todo.title,
    completed: false,
    completedAt: null,
  }));
  await useMorningSessionStore
    .getState()
    .startSession(record.id, dateStr, sessionTodos, goalDeadline);

  // 3. スヌーズスケジュール（失敗してもセッション続行）
  try {
    const snoozeIds = await scheduleSnoozeAlarms(dismissTime);
    const snoozeFiresAt = new Date(
      dismissTime.getTime() + SNOOZE_DURATION_SECONDS * 1000,
    ).toISOString();
    await useMorningSessionStore.getState().setSnoozeState(snoozeIds, snoozeFiresAt);
  } catch {
    // スヌーズ失敗はログのみ — セッション自体は有効に保つ
  }

  // 4. Live Activity 開始（失敗してもセッション続行）
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
 * TODO 全完了時にセッションを完了する。
 *
 * 処理順序:
 * 1. スヌーズアラームのみキャンセル（wake-target アラームは残す）
 * 2. Live Activity 終了
 * 3. WakeRecord 更新（失敗してもセッションクリア — 無限再発火防止）
 * 4. セッションクリア
 * 5. 通常アラーム再スケジュール
 *
 * 呼び出し元: app/(tabs)/index.tsx (全TODO完了検知時)
 */
export async function completeMorningSession(session: MorningSession): Promise<void> {
  const now = new Date();

  // 1. スヌーズアラームのみキャンセル
  await cancelAlarmsByIds(session.snoozeAlarmIds);

  // 2. Live Activity 終了
  if (session.liveActivityId !== null) {
    await endLiveActivity(session.liveActivityId);
  }

  // 3. WakeRecord 更新
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
    // レコード更新失敗でもセッションはクリア（無限再発火防止）
  }

  // 4. セッションクリア
  await useMorningSessionStore.getState().clearSession();

  // 5. 通常アラーム再スケジュール。
  // syncAlarms は session が null（step 4 でクリア済み）を見て target に基づき再登録する。
  await syncAlarms();
}

/**
 * アプリ起動時にセッション状態を復元・クリーンアップする。
 *
 * - 別日のセッション → stale として破棄（Live Activity も終了）
 * - 当日の完了済みセッション → dangling Live Activity を回収
 * - 当日の未完了セッション → snoozeFiresAt が永続化済みなので何もしない
 *
 * 呼び出し元: app/_layout.tsx（初期化時）
 */
export function restoreSessionOnLaunch(dayBoundaryHour: number): void {
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

/**
 * スヌーズアラーム発火時の処理。再スケジュールは不要（先行スケジュール済み）。
 * Live Activity のカウントダウンを次のスヌーズ時刻に更新する。
 *
 * 背景: snooze.ts から移植。セッションライフサイクルの一部として集約。
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

/**
 * アプリ起動時にネイティブ dismiss イベントを確認し、未処理のものから
 * WakeRecord + MorningSession を復元する。
 *
 * 背景: iOS ではアラーム dismiss 時にアプリが起動しない場合がある。
 * ネイティブ側が App Groups に記録した dismiss タイムスタンプを使い、
 * 正確な起床データを復元する。セッション開始後はスヌーズと Live Activity も
 * 開始して通常の朝フローに合流する。
 *
 * 呼び出し元: app/_layout.tsx（初期化時、通常起動 + バックグラウンド復帰時）
 *
 * @returns true if a session was recovered, false otherwise
 */
export async function recoverMissedDismiss(dayBoundaryHour: number): Promise<boolean> {
  // セッションが既にアクティブなら何もしない
  if (useMorningSessionStore.getState().isActive()) {
    await clearDismissEvents();
    return false;
  }

  const events = await getDismissEvents();
  if (events.length === 0) return false;

  // スヌーズ dismiss はスキップ（セッション既存のため handleSnoozeArrival で処理済み）
  const primaryEvents = events.filter((e) => !isSnoozeEvent(e));
  if (primaryEvents.length === 0) {
    await clearDismissEvents();
    return false;
  }

  // 最新のプライマリ dismiss イベントを使用
  // primaryEvents.length > 0 は上の early return で保証済み
  const event = primaryEvents[primaryEvents.length - 1] as NativeDismissEvent;
  const dismissTime = new Date(event.dismissedAt);
  const dateStr = getLogicalDateString(dismissTime, dayBoundaryHour);

  // 同日のレコードが既にある場合はスキップ（wakeup 画面経由で作成済み）
  const { records } = useWakeRecordStore.getState();
  if (records.some((r) => r.date === dateStr)) {
    await clearDismissEvents();
    return false;
  }

  // WakeTarget を取得（復元に必要な TODO リスト等）
  const { target } = useWakeTargetStore.getState();
  if (target === null) {
    await clearDismissEvents();
    return false;
  }

  // resolvedTime: dismiss 時点の曜日に対応するアラーム時刻
  const resolvedTime = resolveTimeForDate(target, dismissTime);
  if (resolvedTime === null) {
    await clearDismissEvents();
    return false;
  }

  // startMorningSession と同等のロジックで WakeRecord + セッションを作成。
  // mountedAt は不明（wakeup 画面を経由していない）ため dismissTime で近似する。
  // alarmTriggeredAt = dismissedAt になるが、正確な dismiss タイムスタンプが残る。
  await startMorningSession({
    target,
    resolvedTime,
    dismissTime,
    mountedAt: dismissTime,
    dayBoundaryHour,
  });

  await clearDismissEvents();
  return true;
}

/**
 * アラームイベント（cold-start / foreground-resume）を統一処理するエントリポイント。
 *
 * 背景: cold-start と foreground-resume で同一の判定ロジックが _layout.tsx に
 * 二重実装されており、一方だけ修正して他方を漏らすバグが繰り返されていた。
 * 全ケースをここに集約することで「直したつもり」問題を根絶する。
 *
 * ルーティング責務: routerPush を引数で受け取ることで、ナビゲーション層への
 * 依存を注入形式にし、テスト時にモック可能にしている。
 *
 * context の違い:
 * - cold-start: restoreSessionOnLaunch + clearExpiredOverride を実行（ストア未ロードの前提）
 * - foreground-resume: ストアは既にロード済みのため上記はスキップ
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
    /** cold-start のみ: 期限切れの曜日オーバーライドをクリアする関数 */
    clearExpiredOverride?: () => void;
  },
): Promise<void> {
  const { routerPush, dayBoundaryHour, clearExpiredOverride } = opts;
  const payload = checkLaunchPayload();

  if (payload !== null) {
    if (isSnoozePayload(payload)) {
      // スヌーズ再発火: Live Activity を更新してダッシュボードへ。
      // cold-start / foreground-resume 両方で同一処理。
      handleSnoozeArrival();
      routerPush('/');
    } else {
      // 初回アラームペイロード: AlarmKit dismiss 済みなら自動でセッション開始。
      // dismiss event がない（ユーザーがまだ止めていない）場合は wakeup 画面へ。
      // cold-start 時のみ restoreSessionOnLaunch を先行実行（stale セッションのクリア）。
      if (context === 'cold-start') {
        restoreSessionOnLaunch(dayBoundaryHour);
      }
      const recovered = await recoverMissedDismiss(dayBoundaryHour);
      if (!recovered) {
        routerPush('/wakeup');
      }
    }
    return;
  }

  // ペイロードなし: アラーム経由でない起動または復帰。
  // cold-start ではセッション復元 + 期限切れオーバーライドのクリアを行う。
  // foreground-resume ではストアが既にロード済みのためスキップ。
  if (context === 'cold-start') {
    restoreSessionOnLaunch(dayBoundaryHour);
    clearExpiredOverride?.();
  }

  // ネイティブ dismiss イベントを確認し、未処理があれば自動復元。
  // アラーム dismiss 時にアプリが起動しなかった場合のセーフティネット。
  const recovered = await recoverMissedDismiss(dayBoundaryHour);
  if (recovered) {
    routerPush('/');
  }
}

/**
 * AlarmKit LaunchPayload がスヌーズ由来かどうかを判定する。
 * scheduleSnoozeAlarms() が payload に { isSnooze: true } を埋め込んでいる。
 */
function isSnoozePayload(payload: { payload: string | null } | null): boolean {
  if (payload === null || payload.payload === null) return false;
  try {
    const parsed = JSON.parse(payload.payload) as { isSnooze?: boolean };
    return parsed.isSnooze === true;
  } catch {
    return false;
  }
}

/**
 * NativeDismissEvent がスヌーズ由来かどうかを判定する。
 * スヌーズアラームは dismissPayload に { isSnooze: true } を埋め込んでいる。
 */
function isSnoozeEvent(event: NativeDismissEvent): boolean {
  if (event.payload === '') return false;
  try {
    const parsed = JSON.parse(event.payload) as { isSnooze?: boolean };
    return parsed.isSnooze === true;
  } catch {
    return false;
  }
}
