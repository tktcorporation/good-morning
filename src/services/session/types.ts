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
import type { NextOverride, WakeTarget } from '../../types/wake-target';
import { resolveRegularTimeForDate } from '../../types/wake-target';
import { formatLocalDate, getLogicalDateString } from '../../utils/date';
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

/**
 * handleAlarmDismissEffect のパラメータ。
 *
 * alarmInstant は実際に発火したと思われるアラームの完全な日時
 * （wake-target.ts の resolveDismissInstant で解決）。時刻（AlarmTime）だけ
 * だと、深夜またぎで前日の override が採用されたケースの日付情報が失われ、
 * goalDeadline のような日付をまたぐ計算が dismissTime の暦日を誤って基準に
 * してしまう。
 */
export interface AlarmDismissParams {
  readonly target: WakeTarget;
  readonly alarmInstant: Date;
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
 * override 時刻が 0 時台前半など深夜帯の場合、now が「その前夜のセッション
 * ウィンドウ前半」（今日 override.targetDate を迎える前夜）に入っているかを
 * 判定する。
 *
 * override 対象日は通常の繰り返しアラームも維持される設計（二重鳴動を許容）
 * のため、この前夜ウィンドウに通常アラームが近接して存在しうる
 * （例: 通常 23:50・override 翌日 00:10）。resolveTimeForDismiss は暦日不一致の
 * 場合を常に regular と判定するため、ここで無条件に true を返すと、通常
 * アラームの dismiss 記録が override 対象日に紐づき、後続の実際の override
 * dismiss が同日重複と誤判定されて記録されなくなる。resolveTimeForDismiss と
 * 同じ基準（絶対時刻差）で regular より override に近い場合のみ true を返し、
 * 判定を一致させる。
 *
 * ただし単純な分差の近さだけで比較すると、通常アラームが既に発火して
 * アフターウィンドウ内（有効中）でも、まだ発火していない override の方が
 * 分差で近ければ override を優先してしまう。発火済みで現在アフター
 * ウィンドウ内の通常アラームがあれば、常にそちらを優先する（未発火の
 * override が現在進行中のセッションを奪ってはならない）。
 */
function isPreMidnightOverrideWindow(
  now: Date,
  target: WakeTarget,
  override: NextOverride,
): boolean {
  const nextDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (formatLocalDate(nextDay) !== override.targetDate) return false;

  const minutesUntilMidnight = 24 * 60 - (now.getHours() * 60 + now.getMinutes());
  const overrideMinutesFromMidnight = override.time.hour * 60 + override.time.minute;
  const overrideDiff = minutesUntilMidnight + overrideMinutesFromMidnight;
  if (overrideDiff > SESSION_WINDOW_BEFORE_MINUTES) return false;

  const regular = resolveRegularTimeForDate(target, now);
  if (regular === null) return true;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const regularMinutes = regular.hour * 60 + regular.minute;
  const minutesSinceRegularFired = nowMinutes - regularMinutes;
  if (minutesSinceRegularFired >= 0 && minutesSinceRegularFired <= SESSION_WINDOW_AFTER_MINUTES) {
    return false;
  }

  const regularDiff = Math.abs(nowMinutes - regularMinutes);
  return overrideDiff <= regularDiff;
}

/**
 * nextOverride を考慮した「今日」の対象日（暦日文字列）を解決する。
 *
 * dayBoundaryHour をアラーム時刻より後に設定している場合（UI は 0〜23 時を
 * 許可する）、アラーム前後の時間帯では論理日付が前日に倒れ、
 * nextOverride.targetDate（暦日）と噛み合わなくなり override を見失う。
 * セッションウィンドウ判定（checkSessionWindow）だけでなく、セッションの
 * stale 判定（restoreSessionOnLaunch）でも同じズレが起きるため、両方から
 * 共有する。now の暦日が targetDate と一致する＝まさに override 対象日を
 * 迎えている場合は、論理日付計算を経由せず targetDate を直接使う。
 *
 * 期限切れ判定（isNextOverrideExpired）はここでは行わない。override は
 * アラーム時刻ちょうどに期限切れとなるため、それを条件に含めると
 * アラーム後 〜 セッションウィンドウ終了（+30分）までの後半が
 * defaultTime 基準の判定に落ちてセッション自動開始に失敗する。
 * 暦日一致の条件だけで「日をまたいだ古い override」は除外できている。
 *
 * override 時刻が 0 時台前半など深夜帯の場合、セッションウィンドウの前半
 * （アラーム時刻の SESSION_WINDOW_BEFORE_MINUTES 分前 〜 0時）は now の暦日が
 * まだ前日のまま。この場合は isPreMidnightOverrideWindow で「翌日が
 * targetDate かつ now がその前夜のウィンドウ前半内」を追加判定し、暦日一致と
 * 同様に targetDate を採用する。
 */
export function resolveOverrideAwareDateStr(
  now: Date,
  target: WakeTarget,
  dayBoundaryHour: number,
): string {
  const override = target.nextOverride;
  if (override !== null) {
    if (formatLocalDate(now) === override.targetDate) {
      return override.targetDate;
    }
    if (isPreMidnightOverrideWindow(now, target, override)) {
      return override.targetDate;
    }
  }
  return getLogicalDateString(now, dayBoundaryHour);
}

/**
 * 現在時刻がセッションウィンドウ内かどうかを判定する。
 * セッション自動開始の判定に使用。
 *
 * override 対象日は通常の繰り返しアラームも維持される設計（二重鳴動を許容）
 * のため、resolveTimeForDate（override 優先で1候補しか返さない）だけで判定すると、
 * override 時刻とかけ離れた通常アラームがまだ発火していないのにそのウィンドウを
 * 見落とし、セッションの自動開始が override 時刻まで遅れてしまう。当日の通常
 * アラーム・override の両方を候補にし、now が実際に含まれるウィンドウを選ぶ。
 *
 * @returns ウィンドウ内ならセッション情報、そうでなければ null
 */
export function checkSessionWindow(
  now: Date,
  target: WakeTarget,
  dayBoundaryHour: number,
): { resolvedTime: AlarmTime; windowEnd: Date; dateStr: string } | null {
  if (!target.enabled || target.todos.length === 0) return null;

  const dateStr = resolveOverrideAwareDateStr(now, target, dayBoundaryHour);
  const logicalDate = new Date(`${dateStr}T12:00:00`);
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];
  const baseDate = new Date(year, month - 1, day);

  const candidates: AlarmTime[] = [];
  const regularTime = resolveRegularTimeForDate(target, logicalDate);
  if (regularTime !== null) candidates.push(regularTime);
  const { nextOverride } = target;
  if (nextOverride !== null && formatLocalDate(logicalDate) === nextOverride.targetDate) {
    candidates.push(nextOverride.time);
  }

  for (const resolvedTime of candidates) {
    const { start, end } = getSessionWindow(resolvedTime, baseDate);
    if (now.getTime() >= start.getTime() && now.getTime() < end.getTime()) {
      return { resolvedTime, windowEnd: end, dateStr };
    }
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
