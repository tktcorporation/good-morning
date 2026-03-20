/**
 * セッションライフサイクル Effect プログラムのバレルエクスポート。
 *
 * セッションの各ライフサイクルフェーズごとにファイルを分割:
 * - types.ts          → 共通型・定数・純粋関数
 * - DismissService.ts → アラーム dismiss 処理
 * - CompletionService → TODO完了・セッション期限切れ
 * - RecoveryService   → 起動時復元・ネイティブ dismiss 復元・スヌーズ到着
 * - AlarmEventRouter  → cold-start/resume の統一エントリポイント
 */

// Effect programs
export { handleAlarmEventEffect } from './AlarmEventRouter';
export { expireSessionIfNeeded, onAllTodosCompletedEffect } from './CompletionService';
export { handleAlarmDismissEffect } from './DismissService';
export {
  handleSnoozeArrivalEffect,
  recoverMissedDismiss,
  restoreSessionOnLaunch,
} from './RecoveryService';
// Types
export type { AlarmDismissParams, SessionError } from './types';
