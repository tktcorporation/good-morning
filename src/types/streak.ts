/**
 * ストリーク（連続達成）の状態管理型。
 *
 * 背景: Daily Grade & Streak System のストリーク追跡部分。
 * DailyGrade の結果に基づいてストリークを加算・維持・リセットし、
 * フリーズ（猶予回数）で poor な日をカバーできる仕組み。
 *
 * 利用箇所: src/services/grade-calculator.ts (applyGradeToStreak),
 *           stores/streak-store.ts (将来)
 * ストリーク機能が不要になれば削除可能。
 */

/**
 * ストリークの現在状態。
 * AsyncStorage に永続化され、毎日のグレード確定時に更新される。
 */
export interface StreakState {
  /** 現在の連続達成日数 */
  readonly currentStreak: number;
  /** 過去最長の連続達成日数 */
  readonly longestStreak: number;
  /** 残りフリーズ回数（0〜MAX_FREEZES）。excellent 獲得で +1、poor で -1 */
  readonly freezesAvailable: number;
  /** フリーズを使用した累計回数（統計表示用） */
  readonly freezesUsedTotal: number;
  /** 最後にグレードが確定した日付 (YYYY-MM-DD)。初回利用前は null */
  readonly lastGradedDate: string | null;
}

/**
 * フリーズの最大保持数。
 * excellent を取り続けても2個までしか貯まらない。
 * ゲームバランス上、あまり多く貯められると poor の抑止力が弱まるため2に制限。
 */
export const MAX_FREEZES = 2;
