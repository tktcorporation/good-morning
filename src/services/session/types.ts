/**
 * セッションライフサイクルの共通型定義・定数・純粋関数。
 *
 * 背景: SessionLifecycleService が600行に肥大化していたため、
 * 型定義と純粋関数を分離した。複数のサービスファイルから共有される。
 *
 * 依存関係: このファイルは他の session/ ファイルに依存しない（リーフモジュール）。
 */

import type { AlarmTime } from '../../types/alarm';
import type { SessionTodo } from '../../types/morning-session';
import type { WakeTodoRecord } from '../../types/wake-record';
import type { WakeTarget } from '../../types/wake-target';
import { resolveTimeForDate } from '../../types/wake-target';
import { getLogicalDateString } from '../../utils/date';
import type { AlarmKitError } from '../AlarmKitService';
import type { NotificationError } from '../errors';

// ─── 定数 ──────────────────────────────────────────────────────

/**
 * セッションはアラーム時刻の何分前に開始するか。
 * 例: アラーム 9:30、BEFORE=30 → セッション開始可能 9:00
 */
export const SESSION_WINDOW_BEFORE_MINUTES = 30;

/**
 * セッションはアラーム時刻の何分後まで維持するか。
 * 例: アラーム 9:30、AFTER=30 → セッション終了 10:00
 */
export const SESSION_WINDOW_AFTER_MINUTES = 30;

// ─── 型定義 ────────────────────────────────────────────────────

/** セッションライフサイクル操作で発生しうるエラーの union */
export type SessionError = AlarmKitError | NotificationError;

/** handleAlarmDismissEffect のパラメータ */
export interface AlarmDismissParams {
  readonly target: WakeTarget;
  readonly resolvedTime: AlarmTime;
  readonly dismissTime: Date;
  readonly mountedAt: Date;
  readonly dayBoundaryHour: number;
}

// ─── セッションウィンドウ計算（純粋関数） ─────────────────────────

/**
 * アラーム時刻からセッションウィンドウ（開始・終了）を算出する。
 *
 * @param resolvedTime 曜日オーバーライド適用後のアラーム時刻
 * @param date ウィンドウを算出する日付（論理日付ベース）
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

// ─── ペイロード判定（純粋関数） ──────────────────────────────────

/** AlarmKit の起動ペイロードがスヌーズ経由かどうかを判定する */
export function isSnoozePayload(payload: { payload: string | null } | null): boolean {
  if (payload === null || payload.payload === null) return false;
  try {
    const parsed = JSON.parse(payload.payload) as { isSnooze?: boolean };
    return parsed.isSnooze === true;
  } catch {
    return false;
  }
}

/** ネイティブ dismiss イベントがスヌーズ経由かどうかを判定する */
export function isSnoozeEvent(event: { payload: string }): boolean {
  if (event.payload === '') return false;
  try {
    const parsed = JSON.parse(event.payload) as { isSnooze?: boolean };
    return parsed.isSnooze === true;
  } catch {
    return false;
  }
}

// ─── セッション TODO の永続化変換（純粋関数） ────────────────────

/**
 * セッションの TODO 群を永続化用の WakeTodoRecord に変換する。
 * 完了済みタスクには配列順（1 始まり）を orderCompleted として付け、
 * 未完了は null にする。完了/期限切れの両方の確定処理で共有する。
 */
export function toWakeTodoRecords(todos: readonly SessionTodo[]): readonly WakeTodoRecord[] {
  return todos.map((todo, index) => ({
    id: todo.id,
    title: todo.title,
    completedAt: todo.completedAt,
    orderCompleted: todo.completed ? index + 1 : null,
    type: todo.type,
  }));
}
