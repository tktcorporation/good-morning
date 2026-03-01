/**
 * セッションライフサイクルのオーケストレーション層。
 *
 * 背景: セッション操作が wakeup.tsx（開始）→ index.tsx（完了）→ _layout.tsx（復元・スヌーズ）に
 * 散在していたため、各画面の責務が肥大化し、テストや変更が困難だった。
 * このモジュールに集約することで、画面は薄いレイヤーとして lifecycle 関数を呼ぶだけになる。
 *
 * 設計詳細: docs/plans/2026-03-01-session-lifecycle-service-design.md
 */

import { useMorningSessionStore } from '../stores/morning-session-store';
import { useWakeRecordStore } from '../stores/wake-record-store';
import { useWakeTargetStore } from '../stores/wake-target-store';
import type { AlarmTime } from '../types/alarm';
import type { MorningSession, SessionTodo } from '../types/morning-session';
import type { WakeTodoRecord } from '../types/wake-record';
import { calculateDiffMinutes, calculateWakeResult } from '../types/wake-record';
import type { WakeTarget } from '../types/wake-target';
import { getLogicalDateString } from '../utils/date';
import {
  cancelAllAlarms,
  endLiveActivity,
  SNOOZE_DURATION_SECONDS,
  SNOOZE_MAX_COUNT,
  scheduleSnoozeAlarms,
  scheduleWakeTargetAlarm,
  startLiveActivity,
  updateLiveActivity,
} from './alarm-kit';

// ---------------------------------------------------------------------------
// 移植済み関数（元: snooze.ts）
// ---------------------------------------------------------------------------

/**
 * アプリ再起動時にスヌーズカウントダウン表示を復元する。
 *
 * 背景: snoozeFiresAt はメモリのみ（永続化しない）ため、アプリ kill → 再起動で消失する。
 * セッション開始時刻と現在時刻から、次に発火するスヌーズの時刻を逆算してストアに設定する。
 * スヌーズ期間（9分 × 20本 = 3時間）が終了している場合は何もしない。
 *
 * 呼び出し元: app/_layout.tsx（通常起動時、セッションが有効な場合）
 */
export function restoreSnoozeCountdown(sessionStartedAt: string): void {
  const startMs = new Date(sessionStartedAt).getTime();
  const nowMs = Date.now();
  const elapsed = nowMs - startMs;
  const intervalMs = SNOOZE_DURATION_SECONDS * 1000;
  const totalDurationMs = intervalMs * SNOOZE_MAX_COUNT;

  // 全スヌーズが発火済み（3時間経過）なら復元不要
  if (elapsed >= totalDurationMs) return;

  // 次のスヌーズ発火時刻を逆算: ceil(経過時間 / 間隔) 番目のスヌーズ
  const nextIndex = Math.ceil(elapsed / intervalMs);
  const nextFireMs = startMs + nextIndex * intervalMs;

  // 計算上の発火時刻が既に過ぎている場合（境界値）はスキップ
  if (nextFireMs <= nowMs) return;

  useMorningSessionStore.getState().setSnoozeFiresAt(new Date(nextFireMs).toISOString());
}

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

// ---------------------------------------------------------------------------
// 新規スタブ（後続タスクで実装予定）
// ---------------------------------------------------------------------------

/**
 * startMorningSession に渡すパラメータ。
 *
 * アラーム dismiss 時に画面（wakeup.tsx）が収集した情報を受け取る。
 * セッション開始に必要な全情報をまとめることで、呼び出し元の責務を最小化する。
 */
export interface StartSessionParams {
  /** 現在の WakeTarget（TODO テンプレート・アラーム再スケジュール情報を含む） */
  readonly target: WakeTarget;
  /** resolveTimeForDate() で解決済みのアラーム目標時刻 */
  readonly resolvedTime: AlarmTime;
  /** ユーザーが dismiss した時刻 */
  readonly dismissTime: Date;
  /** wakeup 画面がマウントされた時刻（alarmTriggeredAt の近似値として使用） */
  readonly mountedAt: Date;
  /** 日付変更ラインの時刻（getLogicalDateString に渡す） */
  readonly dayBoundaryHour: number;
}

/**
 * アラーム dismiss 時にモーニングセッションを開始する。
 *
 * 背景: wakeup.tsx に散在していたセッション開始ロジック（レコード作成 → セッション開始 →
 * スヌーズスケジュール → Live Activity 開始）をこの関数に集約する。
 * 呼び出し元は dismiss 時の情報を StartSessionParams にまとめて渡すだけでよい。
 *
 * 呼び出し元: app/wakeup.tsx（handleDismiss）
 * 実装予定: Task 3
 */
export async function startMorningSession(params: StartSessionParams): Promise<void> {
  const { target, resolvedTime, dismissTime, mountedAt, dayBoundaryHour } = params;
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

  // 1. WakeRecord 作成（失敗時は throw — レコードなしで続行は不整合）
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
  });

  // TODO がなければセッション不要
  if (!hasTodos) return;

  // 2. セッション作成 + AsyncStorage 永続化
  const sessionTodos: readonly SessionTodo[] = target.todos.map((todo) => ({
    id: todo.id,
    title: todo.title,
    completed: false,
    completedAt: null,
  }));
  const store = useMorningSessionStore.getState();
  await store.startSession(record.id, dateStr, sessionTodos);

  // 3. スヌーズ先行スケジュール（失敗してもセッション自体は有効）
  let snoozeFiresAt: string | null = null;
  try {
    const snoozeIds = await scheduleSnoozeAlarms(dismissTime);
    snoozeFiresAt = new Date(dismissTime.getTime() + SNOOZE_DURATION_SECONDS * 1000).toISOString();
    useMorningSessionStore.getState().setSnoozeAlarmIds(snoozeIds);
    useMorningSessionStore.getState().setSnoozeFiresAt(snoozeFiresAt);
  } catch {
    // スヌーズ失敗はログのみ — セッションは続行
  }

  // 4. Live Activity 開始（失敗してもセッション自体は有効）
  try {
    const liveActivityTodos = target.todos.map((td) => ({
      id: td.id,
      title: td.title,
      completed: false,
    }));
    const activityId = await startLiveActivity(liveActivityTodos, snoozeFiresAt);
    if (activityId !== null) {
      await useMorningSessionStore.getState().setLiveActivityId(activityId);
    }
  } catch {
    // Live Activity 失敗はログのみ — セッションは続行
  }
}

/**
 * TODO 全完了時にモーニングセッションを終了する。
 *
 * 背景: index.tsx の completion effect に散在していたセッション完了ロジック
 * （スヌーズキャンセル → Live Activity 終了 → レコード更新 → アラーム再スケジュール →
 * セッションクリア）をこの関数に集約する。
 *
 * 呼び出し元: app/(tabs)/index.tsx（TODO 全完了検知時）
 * 実装予定: Task 4
 */
export async function completeMorningSession(session: MorningSession): Promise<void> {
  const now = new Date();

  // 1. 全アラームキャンセル（スヌーズ含む）
  await cancelAllAlarms();

  // 2. Live Activity 終了（clearSession で liveActivityId が消える前に）
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

  const { updateRecord } = useWakeRecordStore.getState();
  try {
    await updateRecord(session.recordId, {
      todosCompleted: true,
      todosCompletedAt: now.toISOString(),
      todoCompletionSeconds,
      todos: todoRecords,
    });
  } catch {
    // updateRecord 失敗時でもセッションをクリアする。
    // レコード更新は失われるが、セッションが残り続けると completion effect が
    // 無限に再発火し、ユーザーが朝ルーティンから抜け出せなくなる。
  }

  // 4. セッションクリア
  await useMorningSessionStore.getState().clearSession();

  // 5. 通常アラーム再スケジュール
  const { target, setAlarmIds } = useWakeTargetStore.getState();
  if (target?.enabled) {
    const newIds = await scheduleWakeTargetAlarm(target);
    await setAlarmIds(newIds);
  }
}

/**
 * アプリ起動時にセッション状態を復元・クリーンアップする。
 *
 * 背景: _layout.tsx に散在していた起動時処理（期限切れセッションのクリーンアップ →
 * スヌーズカウントダウン復元 → 全完了済み Live Activity の回収）をこの関数に集約する。
 * アプリが kill された後の再起動でも、前回のセッション状態を正しく復元できる。
 *
 * 呼び出し元: app/_layout.tsx（アプリ起動時）
 * 実装予定: Task 5
 */
export function restoreSessionOnLaunch(dayBoundaryHour: number): void {
  const state = useMorningSessionStore.getState();
  if (state.session === null) return;

  // 1. 期限切れセッション（前日以前）のクリーンアップ
  const today = getLogicalDateString(new Date(), dayBoundaryHour);
  if (state.session.date !== today) {
    if (state.session.liveActivityId !== null) {
      endLiveActivity(state.session.liveActivityId);
    }
    state.clearSession();
    return;
  }

  // 2. アクティブセッション（TODO未完了）のスヌーズカウントダウン復元
  if (!state.areAllCompleted()) {
    restoreSnoozeCountdown(state.session.startedAt);
    return;
  }

  // 3. TODO全完了済みだが Live Activity が残っている場合のクリーンアップ
  if (state.session.liveActivityId !== null) {
    endLiveActivity(state.session.liveActivityId);
  }
}
