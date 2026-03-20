/**
 * Effect サービス層のバレルエクスポート。
 *
 * 全サービスタグ、Layer、ランタイム、エラー型、Effect プログラムをここから import できる。
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
export {
  checkLaunchPayload,
  isAlarmKitAvailable,
  playAlarmSound,
  stopAlarmSound,
} from './compat';
// Errors
export {
  AlarmKitOperationError,
  AlarmKitUnavailableError,
  HealthKitError,
  LiveActivityError,
  NotificationError,
  SoundError,
  StorageError,
  WidgetSyncError,
} from './errors';
export type { NotificationService } from './NotificationService';
export { Notification, NotificationLive } from './NotificationService';
export type { AppServices } from './runtime';
// Runtime
export { AppLayer, runEffect, runEffectFork } from './runtime';
export type { SoundService } from './SoundService';
export { Sound, SoundLive } from './SoundService';
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
