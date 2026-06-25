/**
 * サービス層のバレルエクスポート。
 *
 * 全 Effect サービスタグ、Layer、ランタイム、エラー型、Effect プログラムをここから import できる。
 * レガシーサービスは削除済み — 全機能が Effect ベースに統一されている。
 *
 * 構成:
 * - AlarmKitService  : ネイティブ AlarmKit ブリッジ（スケジュール、Live Activity、dismiss イベント）
 * - AlarmSchedulerService : アラームスケジュール・スヌーズロジック
 * - AlarmSyncService : ストア状態 ↔ AlarmKit の同期
 * - StorageService   : AsyncStorage 抽象化
 * - NotificationService : expo-notifications 抽象化
 * - TodoReminderService : TODO 未完了リマインド通知
 * - WidgetSyncService : App Groups ウィジェットデータ同期
 * - session/         : セッションライフサイクル（dismiss → completion → recovery）
 * - compat.ts        : React コンポーネント用の async/sync ラッパー
 *
 * health.ts（HealthKit 睡眠データ）と background-sync.ts（バックグラウンド同期）は
 * プラットフォーム別解決と循環依存回避のためこのバレルからは再エクスポートせず、
 * 各モジュールを直接 import する。
 */

export type { AlarmKitError, AlarmKitService } from './AlarmKitService';
// Services
export { AlarmKit, AlarmKitLive } from './AlarmKitService';
// Effect programs
export {
  cancelAlarmsByIds,
  cancelAllAlarms,
  SNOOZE_DURATION_SECONDS,
  SNOOZE_MAX_COUNT,
  scheduleSnoozeAlarms,
  scheduleWakeTargetAlarm,
} from './AlarmSchedulerService';
export { syncAlarmsEffect } from './AlarmSyncService';
// Legacy-compatible wrappers (Effect サービスを async/sync 関数として提供)
export { checkLaunchPayload, initializeAlarmKit, isAlarmKitAvailable } from './compat';
// Errors
export {
  AlarmKitOperationError,
  AlarmKitUnavailableError,
  HealthKitError,
  LiveActivityError,
  NotificationError,
  StorageError,
  WidgetSyncError,
} from './errors';
export type { NotificationService } from './NotificationService';
export { Notification, NotificationLive } from './NotificationService';
export type { AppServices } from './runtime';
// Runtime
export { AppLayer, runEffect, runEffectFork } from './runtime';
export type { StorageService } from './StorageService';
export { Storage, StorageLive } from './StorageService';
export type { AlarmDismissParams } from './session';
export {
  handleAlarmDismissEffect,
  handleAlarmEventEffect,
  handleSnoozeArrivalEffect,
  onAllTodosCompletedEffect,
} from './session';
export {
  cancelReminderNotifications as cancelReminderNotificationsEffect,
  scheduleReminderNotifications as scheduleReminderNotificationsEffect,
} from './TodoReminderService';
export { syncWidgetEffect } from './WidgetSyncService';
