/**
 * background-sync の Web 用 no-op スタブ。
 *
 * expo-background-fetch / expo-task-manager は Web 非対応。
 * ネイティブ版はトップレベルで TaskManager.defineTask() を呼ぶため、
 * Web ではモジュール自体を差し替える必要がある。
 */

export const BACKGROUND_WIDGET_SYNC = 'BACKGROUND_WIDGET_SYNC';

export async function registerBackgroundSync(): Promise<void> {
  // Web ではバックグラウンドタスクを登録しない
}
