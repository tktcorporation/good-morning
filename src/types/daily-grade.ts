/**
 * 1日の総合グレードと就寝評価の型定義。
 *
 * 背景: Daily Grade & Streak System の基盤型。
 * 朝の起床結果（WakeResult）と夜の就寝時刻から1日を4段階で評価し、
 * ストリーク計算やUI表示に使用する。
 *
 * 利用箇所: src/services/grade-calculator.ts, stores/streak-store.ts (将来)
 * WakeResult が不要になればこの型も不要になる。
 */

/** 1日の総合グレード。朝・夜の2軸から算出される。 */
export type DailyGrade = 'excellent' | 'good' | 'fair' | 'poor';

/** 夜の評価（就寝時刻が目標範囲内か） */
export type BedtimeResult = 'onTime' | 'late' | 'noData';

/**
 * 1日分のグレード記録。
 *
 * アラーム解除〜翌朝の就寝評価が揃った時点で確定し、AsyncStorage に永続化される。
 * date をキーとして日ごとに1レコード存在する。
 */
export interface DailyGradeRecord {
  /** YYYY-MM-DD 形式の日付。レコードの一意キー。 */
  readonly date: string;
  /** 朝×夜の2軸から算出された総合グレード */
  readonly grade: DailyGrade;
  /** WakeResult が great/ok なら true */
  readonly morningPass: boolean;
  /** 就寝時刻の評価結果 */
  readonly bedtimeResult: BedtimeResult;
  /** HH:mm 形式の就寝目標時刻。設定がなければ null */
  readonly bedtimeTarget: string | null;
  /** ISO datetime 形式の実際の就寝時刻。データがなければ null */
  readonly actualBedtime: string | null;
}
