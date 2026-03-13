/**
 * バックグラウンドウィジェット同期タスク。
 *
 * 背景: ホームウィジェットのデータをアプリ非使用時にも最新に保つため、
 * expo-background-fetch で iOS に定期実行を登録する。
 * タスクが起動されると全ストアを AsyncStorage から再読み込みし、
 * App Groups UserDefaults にウィジェットデータを書き出す。
 *
 * 呼び出し元: iOS バックグラウンドフェッチ（30分〜数時間間隔）
 * 登録: _layout.tsx の初期化で registerBackgroundSync() を呼ぶ
 */

import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { syncWidget } from './widget-sync';

/**
 * バックグラウンドウィジェット同期タスクの識別子。
 * expo-task-manager に登録し、iOS が定期的に実行する。
 */
export const BACKGROUND_WIDGET_SYNC = 'BACKGROUND_WIDGET_SYNC';

/**
 * バックグラウンドタスクを定義する。
 * アプリのトップレベル（import 時）で実行される必要がある。
 * React コンポーネントのライフサイクル外で動作するため、
 * Zustand ストアに直接アクセスしてデータを読み取る。
 */
TaskManager.defineTask(BACKGROUND_WIDGET_SYNC, async () => {
  try {
    // ストアの状態は AsyncStorage から最新を読み込む必要がある。
    // BG 起動時はストアが初期状態のため、先にロードする。
    const { useWakeTargetStore } = await import('../stores/wake-target-store');
    const { useMorningSessionStore } = await import('../stores/morning-session-store');
    const { useDailyGradeStore } = await import('../stores/daily-grade-store');
    const { useSettingsStore } = await import('../stores/settings-store');

    await Promise.all([
      useWakeTargetStore.getState().loadTarget(),
      useMorningSessionStore.getState().loadSession(),
      useDailyGradeStore.getState().loadGrades(),
      useSettingsStore.getState().loadSettings(),
    ]);

    // ウィジェットデータ同期
    await syncWidget();

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * バックグラウンドフェッチタスクを登録する。
 * _layout.tsx の初期化で1回呼ぶ。既に登録済みなら何もしない。
 */
export async function registerBackgroundSync(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_WIDGET_SYNC);
  if (isRegistered) return;

  await BackgroundFetch.registerTaskAsync(BACKGROUND_WIDGET_SYNC, {
    minimumInterval: 30 * 60, // 30分
    stopOnTerminate: false,
    startOnBoot: true,
  });
}
