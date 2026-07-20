/**
 * セッション/アラーム系サービスが安全に処理を進めてよいかのストア準備状態。
 *
 * 背景: wake-target/wake-record/morning-session/settings は AsyncStorage からの
 * 非同期読み込みが完了するまで loaded=false であり、その間はメモリ上の初期値
 * （空配列・null・デフォルト設定）しか持たない。この状態のまま dismiss処理・
 * セッション自動開始・アラーム同期を進めると、まだ読み込んでいないだけの
 * 永続化済みの実データを空/デフォルト値で上書きしてしまう。
 *
 * この判定の組み合わせは複数のサービスファイル（DismissService/AlarmEventRouter、
 * AlarmSyncService/RecoveryService）で個別に再実装されていたため、ここに集約する。
 */

import { useMorningSessionStore } from '../../stores/morning-session-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useWakeRecordStore } from '../../stores/wake-record-store';
import { useWakeTargetStore } from '../../stores/wake-target-store';

/**
 * dismiss 処理・セッション自動開始が安全に進められるか（wakeRecord/session/settings）。
 * 呼び出し元: DismissService.handleAlarmDismissEffect, AlarmEventRouter.tryAutoStartSession
 */
export function isDismissProcessingReady(): boolean {
  return (
    useWakeRecordStore.getState().loaded &&
    useMorningSessionStore.getState().loaded &&
    useSettingsStore.getState().loaded
  );
}

/**
 * アラーム同期・見逃し dismiss の復旧処理が安全に進められるか
 * （wake-target/wakeRecord/session/settings）。
 * 呼び出し元: AlarmSyncService.syncAlarmsEffect, RecoveryService.recoverMissedDismiss
 */
export function isFullSyncReady(): boolean {
  return (
    useWakeTargetStore.getState().loaded &&
    useWakeRecordStore.getState().loaded &&
    useMorningSessionStore.getState().loaded &&
    useSettingsStore.getState().loaded
  );
}
