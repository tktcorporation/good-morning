/**
 * Daily Grade の算出とストリーク更新の純粋関数群。
 *
 * 背景: Daily Grade & Streak System のコアロジック。
 * 朝の起床結果と夜の就寝時刻を入力とし、1日の総合グレードを算出する。
 * すべて純粋関数で副作用なし — テスト容易性とストアからの分離を重視。
 *
 * 利用箇所: stores/streak-store.ts (将来), app/wakeup/ 画面群
 * DailyGrade / StreakState の型が変わればこのファイルも更新が必要。
 */

import type { BedtimeResult, DailyGrade } from '../types/daily-grade';
import type { StreakState } from '../types/streak';
import { MAX_FREEZES } from '../types/streak';
import type { WakeResult } from '../types/wake-record';

/**
 * 朝の起床が「合格」かどうかを判定する。
 *
 * WakeResult が 'great' または 'ok' なら合格（true）。
 * 'late' や 'missed' は不合格（false）。
 * calculateDailyGrade の入力として使われる。
 */
export function isMorningPass(result: WakeResult): boolean {
  return result === 'great' || result === 'ok';
}

/**
 * 就寝目標に対する許容範囲（分）。
 * 目標時刻 ± 30分以内なら onTime と判定する。
 * 30分は「布団に入ってから寝付くまでの一般的な許容幅」として設定。
 */
const BEDTIME_TOLERANCE_MINUTES = 30;

/**
 * 実際の就寝時刻を目標と比較して評価する。
 *
 * - actualBedtime が null なら 'noData'（HealthKit 連携なし等）
 * - 目標 ± 30分以内なら 'onTime'
 * - それ以外は 'late'
 *
 * 日付をまたぐケース（例: 目標23:00、実際0:30）も正しく処理する。
 * 具体的には、差分が12時間を超える場合は24時間分の補正を行い、
 * 「翌日の0:30は23:00の1.5時間後」として計算する。
 *
 * AlarmTime 構造体ではなく hour/minute を直接受け取る。
 * 呼び出し元が DailyGradeRecord.bedtimeTarget (HH:mm 文字列) からパースして渡すことを想定。
 * 秒以下は切り捨て。HealthKit の就寝データは分単位で十分な精度のため。
 *
 * @param actualBedtime - 実際の就寝時刻。null ならデータなし
 * @param targetHour - 就寝目標の時 (0-23)
 * @param targetMinute - 就寝目標の分 (0-59)
 */
export function evaluateBedtime(
  actualBedtime: Date | null,
  targetHour: number,
  targetMinute: number,
): BedtimeResult {
  if (actualBedtime === null) {
    return 'noData';
  }

  const actualMinutesFromMidnight = actualBedtime.getHours() * 60 + actualBedtime.getMinutes();
  const targetMinutesFromMidnight = targetHour * 60 + targetMinute;

  let diffMinutes = actualMinutesFromMidnight - targetMinutesFromMidnight;

  // 日付をまたぐ場合の補正。
  // 例: 目標 23:00 (1380分), 実際 0:30 (30分) → diff = -1350
  // 24時間 (1440分) を足して diff = 90 → 「90分遅い」と正しく判定。
  // 逆に: 目標 0:30 (30分), 実際 23:00 (1380分) → diff = 1350
  // 24時間を引いて diff = -90 → 「90分早い」と正しく判定。
  const HALF_DAY_MINUTES = 720;
  if (diffMinutes > HALF_DAY_MINUTES) {
    diffMinutes -= 1440;
  } else if (diffMinutes < -HALF_DAY_MINUTES) {
    diffMinutes += 1440;
  }

  return Math.abs(diffMinutes) <= BEDTIME_TOLERANCE_MINUTES ? 'onTime' : 'late';
}

/**
 * 朝の合否と夜の評価から1日の総合グレードを算出する。
 *
 * 2軸マトリクス:
 * | 朝   | 夜          | グレード  |
 * |------|-------------|-----------|
 * | pass | onTime      | excellent |
 * | pass | late/noData | good      |
 * | fail | onTime      | fair      |
 * | fail | late/noData | poor      |
 *
 * 朝を優先軸にしているのは、本アプリの主目的が「起床の改善」であるため。
 */
export function calculateDailyGrade(
  morningPass: boolean,
  bedtimeResult: BedtimeResult,
): DailyGrade {
  const bedtimePass = bedtimeResult === 'onTime';

  if (morningPass && bedtimePass) return 'excellent';
  if (morningPass) return 'good';
  if (bedtimePass) return 'fair';
  return 'poor';
}

/**
 * グレードに基づいてストリーク状態を更新する（イミュータブル）。
 *
 * ルール:
 * - excellent → streak += 1, freezes = min(freezes + 1, MAX_FREEZES)
 * - good      → streak += 1
 * - fair      → streak 維持（増えない、減らない）
 * - poor      → freezes > 0 ? freezes -= 1 (streak 維持) : streak = 0
 *
 * longestStreak は currentStreak が更新されるたびに比較・更新する。
 *
 * @param current - 現在のストリーク状態
 * @param grade - 確定したグレード
 * @param gradedDate - グレード対象日 (YYYY-MM-DD)。lastGradedDate の更新に使用。
 * @returns 新しい StreakState。元のオブジェクトは変更しない。
 */
export function applyGradeToStreak(
  current: StreakState,
  grade: DailyGrade,
  gradedDate: string,
): StreakState {
  switch (grade) {
    case 'excellent': {
      const newStreak = current.currentStreak + 1;
      return {
        ...current,
        currentStreak: newStreak,
        longestStreak: Math.max(current.longestStreak, newStreak),
        freezesAvailable: Math.min(current.freezesAvailable + 1, MAX_FREEZES),
        lastGradedDate: gradedDate,
      };
    }
    case 'good': {
      const newStreak = current.currentStreak + 1;
      return {
        ...current,
        currentStreak: newStreak,
        longestStreak: Math.max(current.longestStreak, newStreak),
        lastGradedDate: gradedDate,
      };
    }
    case 'fair': {
      return { ...current, lastGradedDate: gradedDate };
    }
    case 'poor': {
      if (current.freezesAvailable > 0) {
        return {
          ...current,
          freezesAvailable: current.freezesAvailable - 1,
          freezesUsedTotal: current.freezesUsedTotal + 1,
          lastGradedDate: gradedDate,
        };
      }
      return {
        ...current,
        currentStreak: 0,
        lastGradedDate: gradedDate,
      };
    }
  }
}
