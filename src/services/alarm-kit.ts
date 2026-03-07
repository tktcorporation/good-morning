export const APP_GROUP_ID = 'group.com.tktcorporation.goodmorning';

// biome-ignore lint/suspicious/noConsole: AlarmKit errors need logging for debugging — live-activity.ts も使う
export const logError = console.error;
// biome-ignore lint/suspicious/noConsole: AlarmKit availability needs logging
const logWarn = console.warn;

// Lazy-load expo-alarm-kit to avoid crash when native module is unavailable
type AlarmKitModule = typeof import('expo-alarm-kit');
let alarmKit: AlarmKitModule | null = null;
let alarmKitChecked = false;

export function getAlarmKit(): AlarmKitModule | null {
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

export function checkLaunchPayload(): LaunchPayload | null {
  const kit = getAlarmKit();
  if (kit === null) return null;
  return kit.getLaunchPayload();
}

/**
 * App Groups UserDefaults にウィジェット表示用データを書き込む。
 * Widget Extension がこのデータを読み取ってタイムラインを生成する。
 * ネイティブモジュールが利用不可の場合は no-op。
 */
export async function syncWidgetData(jsonString: string): Promise<void> {
  const kit = getAlarmKit();
  if (kit === null) return;
  const fn = (kit as Record<string, unknown>).syncWidgetData;
  if (typeof fn !== 'function') return;
  try {
    await (fn as (groupId: string, json: string) => Promise<void>)(APP_GROUP_ID, jsonString);
  } catch (e) {
    logError('[AlarmKit] syncWidgetData failed:', e);
  }
}

/**
 * WidgetCenter.shared.reloadAllTimelines() を呼び出して全ウィジェットを更新する。
 * syncWidgetData() の後に呼ぶ。ネイティブモジュールが利用不可の場合は no-op。
 */
export async function reloadWidgetTimelines(): Promise<void> {
  const kit = getAlarmKit();
  if (kit === null) return;
  const fn = (kit as Record<string, unknown>).reloadWidgetTimelines;
  if (typeof fn !== 'function') return;
  try {
    await (fn as () => Promise<void>)();
  } catch (e) {
    logError('[AlarmKit] reloadWidgetTimelines failed:', e);
  }
}

/**
 * ネイティブ AlarmDismissIntent.perform() が App Groups に記録する dismiss イベント。
 *
 * 背景: iOS ではアラーム dismiss 時にアプリが起動しない場合がある。
 * ネイティブ側で dismiss タイムスタンプを永続化し、次回アプリ起動時に
 * recoverMissedDismiss() が読み取って WakeRecord を作成する。
 *
 * ライフサイクル: ネイティブ dismiss 時に作成 → JS recoverMissedDismiss() で消費 → clearDismissEvents() で削除
 */
export interface NativeDismissEvent {
  readonly alarmId: string;
  readonly dismissedAt: string; // ISO 8601
  readonly payload: string; // "" or JSON (e.g. '{"isSnooze":true}')
}

/**
 * App Groups UserDefaults から未処理の dismiss イベントを取得する。
 * ネイティブモジュールが利用不可の場合は空配列を返す。
 *
 * 呼び出し元: recoverMissedDismiss() (session-lifecycle.ts)
 */
export async function getDismissEvents(): Promise<readonly NativeDismissEvent[]> {
  const kit = getAlarmKit();
  if (kit === null) return [];
  const fn = (kit as Record<string, unknown>).getDismissEvents;
  if (typeof fn !== 'function') return [];
  try {
    return (fn as () => NativeDismissEvent[])();
  } catch (e) {
    logError('[AlarmKit] getDismissEvents failed:', e);
    return [];
  }
}

/**
 * 処理済みの dismiss イベントを App Groups から削除する。
 * recoverMissedDismiss() の最後に呼ばれる。
 *
 * 呼び出し元: recoverMissedDismiss() (session-lifecycle.ts)
 */
export async function clearDismissEvents(): Promise<void> {
  const kit = getAlarmKit();
  if (kit === null) return;
  const fn = (kit as Record<string, unknown>).clearDismissEvents;
  if (typeof fn !== 'function') return;
  try {
    (fn as () => void)();
  } catch (e) {
    logError('[AlarmKit] clearDismissEvents failed:', e);
  }
}

/**
 * ネイティブ AlarmDismissIntent が App Groups に保存したスヌーズアラーム ID を取得する。
 *
 * 背景: アラーム dismiss 時にアプリが起動しない場合でも、ネイティブ側で
 * スヌーズアラームを先行スケジュールする。次回アプリ起動時にこの関数で
 * スケジュール済みの ID を読み取り、JS 側の session state に反映する。
 *
 * ライフサイクル: ネイティブ dismiss 時に作成 → JS startMorningSession() で読み取り → clearSnoozeAlarmIds() で削除
 * 呼び出し元: startMorningSession() (session-lifecycle.ts)
 */
export function getSnoozeAlarmIds(): readonly string[] {
  const kit = getAlarmKit();
  if (kit === null) return [];
  const fn = (kit as Record<string, unknown>).getSnoozeAlarmIds;
  if (typeof fn !== 'function') return [];
  try {
    return (fn as () => string[])();
  } catch (e) {
    logError('[AlarmKit] getSnoozeAlarmIds failed:', e);
    return [];
  }
}

/**
 * ネイティブ側が保存したスヌーズアラーム ID を App Groups から削除する。
 * startMorningSession() で ID を読み取った後に呼ばれる。
 * 二重読み取りを防ぐため、読み取り後に必ずクリアする。
 *
 * 呼び出し元: startMorningSession() (session-lifecycle.ts)
 */
export function clearSnoozeAlarmIds(): void {
  const kit = getAlarmKit();
  if (kit === null) return;
  const fn = (kit as Record<string, unknown>).clearSnoozeAlarmIds;
  if (typeof fn !== 'function') return;
  try {
    (fn as () => void)();
  } catch (e) {
    logError('[AlarmKit] clearSnoozeAlarmIds failed:', e);
  }
}
