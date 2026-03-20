/**
 * Effect サービス層で使用するエラー型定義。
 *
 * 背景: 従来の fire-and-forget パターンではエラーが `.catch(() => {})` で握り潰されていた。
 * Effect の型レベルエラー追跡により、各操作が失敗しうることが型に現れ、
 * 呼び出し元が明示的にハンドリング戦略を選択できる。
 *
 * 設計: Data.TaggedError を使い、各エラーに _tag を付与。
 * Effect.catchTag で特定エラーのみを捕捉するパターンマッチが可能。
 */

import { Data } from 'effect';

/** AlarmKit ネイティブモジュールが利用不可（シミュレータ・未インストール等） */
export class AlarmKitUnavailableError extends Data.TaggedError('AlarmKitUnavailableError')<{
  readonly message: string;
}> {}

/** AlarmKit の操作（スケジュール・キャンセル・認可等）が失敗 */
export class AlarmKitOperationError extends Data.TaggedError('AlarmKitOperationError')<{
  readonly operation: string;
  readonly cause?: unknown;
}> {}

/** AsyncStorage の読み書きが失敗 */
export class StorageError extends Data.TaggedError('StorageError')<{
  readonly operation: 'read' | 'write' | 'remove';
  readonly key: string;
  readonly cause?: unknown;
}> {}

/** オーディオ再生・停止の失敗 */
export class SoundError extends Data.TaggedError('SoundError')<{
  readonly operation: 'play' | 'stop' | 'configure';
  readonly cause?: unknown;
}> {}

/** expo-notifications の操作失敗 */
export class NotificationError extends Data.TaggedError('NotificationError')<{
  readonly operation: 'schedule' | 'cancel';
  readonly cause?: unknown;
}> {}

/** Live Activity の操作失敗 */
export class LiveActivityError extends Data.TaggedError('LiveActivityError')<{
  readonly operation: 'start' | 'update' | 'end';
  readonly cause?: unknown;
}> {}

/** HealthKit の操作失敗 */
export class HealthKitError extends Data.TaggedError('HealthKitError')<{
  readonly operation: 'init' | 'query';
  readonly cause?: unknown;
}> {}

/** Widget 同期の失敗 */
export class WidgetSyncError extends Data.TaggedError('WidgetSyncError')<{
  readonly cause?: unknown;
}> {}
