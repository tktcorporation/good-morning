export const APP_GROUP_ID = 'group.com.tktcorporation.goodmorning';

// biome-ignore lint/suspicious/noConsole: AlarmKit errors need logging for debugging
const logError = console.error;
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
