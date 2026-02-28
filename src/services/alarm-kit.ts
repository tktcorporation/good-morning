import type { AlarmTime, DayOfWeek } from '../types/alarm';
import type { WakeTarget } from '../types/wake-target';

export const APP_GROUP_ID = 'group.com.tktcorporation.goodmorning';

// biome-ignore lint/suspicious/noConsole: AlarmKit errors need logging for debugging
const logError = console.error;
// biome-ignore lint/suspicious/noConsole: AlarmKit availability needs logging
const logWarn = console.warn;

// Lazy-load expo-alarm-kit to avoid crash when native module is unavailable
type AlarmKitModule = typeof import('expo-alarm-kit');
let alarmKit: AlarmKitModule | null = null;
let alarmKitChecked = false;

function getAlarmKit(): AlarmKitModule | null {
  if (alarmKitChecked) return alarmKit;
  alarmKitChecked = true;
  try {
    alarmKit = require('expo-alarm-kit') as AlarmKitModule;
    return alarmKit;
  } catch {
    logWarn('[AlarmKit] Native module not available — alarm scheduling disabled');
    return null;
  }
}

export function isAlarmKitAvailable(): boolean {
  return getAlarmKit() !== null;
}

export interface LaunchPayload {
  alarmId: string;
  payload: string | null;
}

export async function initializeAlarmKit(): Promise<'authorized' | 'denied'> {
  const kit = getAlarmKit();
  if (kit === null) return 'denied';

  const configured = kit.configure(APP_GROUP_ID);
  if (!configured) {
    logError('[AlarmKit] Failed to configure App Group');
    return 'denied';
  }
  const status = await kit.requestAuthorization();
  return status === 'authorized' ? 'authorized' : 'denied';
}

/**
 * Convert DayOfWeek (0=Sunday, 1=Monday, ..., 6=Saturday)
 * to iOS Calendar weekday (1=Sunday, 2=Monday, ..., 7=Saturday)
 */
function toIOSWeekday(day: DayOfWeek): number {
  return day + 1;
}

/**
 * Resolve the alarm time for a specific day, considering overrides.
 * Returns null if the day is set to OFF.
 */
function resolveTimeForDay(target: WakeTarget, day: DayOfWeek): AlarmTime | null {
  const override = target.dayOverrides[day];
  if (override !== undefined) {
    if (override.type === 'off') return null;
    return override.time;
  }
  return target.defaultTime;
}

/**
 * Group enabled days by their resolved time so we can schedule
 * one repeating alarm per unique time.
 */
function groupDaysByTime(
  target: WakeTarget,
): ReadonlyMap<string, { time: AlarmTime; weekdays: number[] }> {
  const groups = new Map<string, { time: AlarmTime; weekdays: number[] }>();
  for (let d = 0; d < 7; d++) {
    const day = d as DayOfWeek;
    const time = resolveTimeForDay(target, day);
    if (time === null) continue;
    const key = `${time.hour}:${time.minute}`;
    const existing = groups.get(key);
    if (existing !== undefined) {
      existing.weekdays.push(toIOSWeekday(day));
    } else {
      groups.set(key, { time, weekdays: [toIOSWeekday(day)] });
    }
  }
  return groups;
}

export async function scheduleWakeTargetAlarm(target: WakeTarget): Promise<readonly string[]> {
  // Cancel all existing alarms first
  await cancelAllAlarms();

  const kit = getAlarmKit();
  if (kit === null || !target.enabled) return [];

  const ids: string[] = [];
  const alarmTitle = 'Good Morning';

  // Schedule repeating alarms grouped by time
  const groups = groupDaysByTime(target);
  for (const [, { time, weekdays }] of groups) {
    const id = kit.generateUUID();
    const success = await kit.scheduleRepeatingAlarm({
      id,
      hour: time.hour,
      minute: time.minute,
      weekdays,
      title: alarmTitle,
      soundName: target.soundId !== 'default' ? `${target.soundId}.mp3` : undefined,
      launchAppOnDismiss: true,
      // ネイティブ Snooze ボタンを有効化。先行スケジュール済みスヌーズに加え、
      // ユーザーが即座にスヌーズしたい場合のフォールバックとして機能する。
      doSnoozeIntent: true,
    });
    if (success) ids.push(id);
  }

  // Schedule one-time alarm for nextOverride
  if (target.nextOverride !== null) {
    const id = kit.generateUUID();
    const now = new Date();
    const alarmDate = new Date(now);
    alarmDate.setHours(target.nextOverride.time.hour, target.nextOverride.time.minute, 0, 0);
    // If the time has already passed today, schedule for tomorrow
    if (alarmDate.getTime() <= now.getTime()) {
      alarmDate.setDate(alarmDate.getDate() + 1);
    }
    const epochSeconds = Math.floor(alarmDate.getTime() / 1000);

    const success = await kit.scheduleAlarm({
      id,
      epochSeconds,
      title: alarmTitle,
      soundName: target.soundId !== 'default' ? `${target.soundId}.mp3` : undefined,
      launchAppOnDismiss: true,
    });
    if (success) ids.push(id);
  }

  return ids;
}

/**
 * iOSの標準アラームと同じ9分間隔。
 * 由来: 機械式時計時代の歯車制約から生まれた慣習で、ユーザーにとって馴染みのある間隔。
 */
export const SNOOZE_DURATION_SECONDS = 540;

/** 先行スケジュールするスヌーズの最大本数。9分 × 20 = 3時間分。 */
export const SNOOZE_MAX_COUNT = 20;

/**
 * メインアラームの dismissTime を基準に、9分間隔でスヌーズアラームを先行スケジュールする。
 *
 * 背景: iOS ではロック画面から dismiss するとアプリが起動しない場合がある。
 * JS 側で1本ずつスケジュールする方式だとスヌーズが途切れるため、
 * アラーム設定時にまとめてスケジュールし、ネイティブ側で確実に発火させる。
 *
 * 呼び出し元: app/wakeup.tsx (アラーム dismiss 後のセッション開始時)
 * 対になる関数: cancelAllAlarms() (TODO全完了時に全アラームをキャンセル後、通常アラームを再スケジュール)
 *
 * @param baseTime スヌーズ起算時刻（通常はアラーム dismiss 時刻）
 * @param count スケジュールする本数（デフォルト SNOOZE_MAX_COUNT）
 * @returns スケジュールに成功したアラーム ID の配列
 */
export async function scheduleSnoozeAlarms(
  baseTime: Date,
  count: number = SNOOZE_MAX_COUNT,
): Promise<readonly string[]> {
  const kit = getAlarmKit();
  if (kit === null) return [];

  const ids: string[] = [];
  for (let i = 1; i <= count; i++) {
    const id = kit.generateUUID();
    const snoozeDate = new Date(baseTime.getTime() + SNOOZE_DURATION_SECONDS * 1000 * i);
    const epochSeconds = Math.floor(snoozeDate.getTime() / 1000);

    try {
      const success = await kit.scheduleAlarm({
        id,
        epochSeconds,
        title: 'Good Morning',
        launchAppOnDismiss: true,
        dismissPayload: JSON.stringify({ isSnooze: true }),
      });
      if (success) ids.push(id);
    } catch {
      // 個別のスケジュール失敗はスキップして残りを続行
    }
  }
  return ids;
}

export async function cancelAllAlarms(): Promise<void> {
  const kit = getAlarmKit();
  if (kit === null) return;

  const existing = kit.getAllAlarms();
  const cancellations = existing.map((id) => kit.cancelAlarm(id));
  await Promise.all(cancellations);
}

/**
 * Live Activity ウィジェットに表示するTODO項目。
 * SessionTodo の軽量サブセットで、ネイティブ側に渡すために plain object にする。
 */
export interface LiveActivityTodo {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}

/**
 * ロック画面にTODO進捗とスヌーズカウントダウンを表示する Live Activity を開始する。
 *
 * ネイティブモジュールが未実装の場合は null を返し、アプリの動作には影響しない（graceful degradation）。
 * 呼び出し元: app/wakeup.tsx (セッション開始＋スヌーズスケジュール後)
 */
export async function startLiveActivity(
  todos: readonly LiveActivityTodo[],
  snoozeFiresAt: string | null,
): Promise<string | null> {
  const kit = getAlarmKit();
  if (kit === null) return null;

  try {
    const snoozeEpoch =
      snoozeFiresAt !== null ? Math.floor(new Date(snoozeFiresAt).getTime() / 1000) : null;
    const startFn = (kit as Record<string, unknown>).startLiveActivity;
    if (typeof startFn !== 'function') return null;
    const result = await (
      startFn as (todos: object[], epoch: number | null) => Promise<string | null>
    )(
      todos.map((t) => ({ id: t.id, title: t.title, completed: t.completed })),
      snoozeEpoch,
    );
    return result ?? null;
  } catch (e) {
    logError('[AlarmKit] startLiveActivity failed:', e);
    return null;
  }
}

/**
 * Live Activity のTODO進捗・スヌーズカウントダウンを更新する。
 *
 * 呼び出し元:
 *   - app/(tabs)/index.tsx: TODOトグル時に完了状態を反映
 *   - app/wakeup.tsx: スヌーズ再発火時に新しいカウントダウンを反映
 */
export async function updateLiveActivity(
  activityId: string,
  todos: readonly LiveActivityTodo[],
  snoozeFiresAt: string | null,
): Promise<void> {
  const kit = getAlarmKit();
  if (kit === null) return;

  try {
    const updateFn = (kit as Record<string, unknown>).updateLiveActivity;
    if (typeof updateFn !== 'function') return;
    const snoozeEpoch =
      snoozeFiresAt !== null ? Math.floor(new Date(snoozeFiresAt).getTime() / 1000) : null;
    await (updateFn as (id: string, todos: object[], epoch: number | null) => Promise<boolean>)(
      activityId,
      todos.map((t) => ({ id: t.id, title: t.title, completed: t.completed })),
      snoozeEpoch,
    );
  } catch (e) {
    logError('[AlarmKit] updateLiveActivity failed:', e);
  }
}

/**
 * Live Activity を終了してロック画面から除去する。
 *
 * 呼び出し元: app/(tabs)/index.tsx (TODO全完了時、セッションクリア前)
 */
export async function endLiveActivity(activityId: string): Promise<void> {
  const kit = getAlarmKit();
  if (kit === null) return;

  try {
    const endFn = (kit as Record<string, unknown>).endLiveActivity;
    if (typeof endFn !== 'function') return;
    await (endFn as (id: string) => Promise<boolean>)(activityId);
  } catch (e) {
    logError('[AlarmKit] endLiveActivity failed:', e);
  }
}

export function checkLaunchPayload(): LaunchPayload | null {
  const kit = getAlarmKit();
  if (kit === null) return null;
  return kit.getLaunchPayload();
}
