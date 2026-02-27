/**
 * 未確定日のグレードレコードを組み立てる純粋関数。
 *
 * 背景: useGradeFinalization フックから呼ばれ、1日分の DailyGradeRecord を構築する。
 * 副作用（addGrade、HealthKit アクセス）はフック側で行い、
 * この関数はデータの組み立てのみを担当する。テスト容易性のために分離。
 *
 * 呼び出し元: src/hooks/useGradeFinalization.ts
 * 不要になる条件: グレードシステムが廃止された場合
 */

import type { AlarmTime } from '../types/alarm';
import type { BedtimeResult, DailyGradeRecord } from '../types/daily-grade';
import type { WakeRecord } from '../types/wake-record';

import { calculateDailyGrade, evaluateBedtime, isMorningPass } from './grade-calculator';

/**
 * 1日分の DailyGradeRecord を組み立てる。
 *
 * WakeRecord の有無と HealthKit の就寝データから朝・夜の判定を行い、
 * calculateDailyGrade で総合グレードを算出して DailyGradeRecord を返す。
 *
 * @param dateStr - 対象日 (YYYY-MM-DD)
 * @param record - その日の WakeRecord。アラーム未解除なら undefined
 * @param bedtimeTarget - 就寝目標時刻。未設定なら null
 * @param sleepBedtime - HealthKit から取得した実際の就寝時刻 (ISO datetime)。データなしなら null
 */
export function buildGradeRecord(
  dateStr: string,
  record: WakeRecord | undefined,
  bedtimeTarget: AlarmTime | null,
  sleepBedtime: string | null,
): DailyGradeRecord {
  // 朝の判定: WakeRecord があれば result から合否判定、なければ不合格
  const morningPass = record !== undefined ? isMorningPass(record.result) : false;

  // 夜の判定: 就寝目標と実際の就寝時刻の両方が必要
  let bedtimeResult: BedtimeResult = 'noData';
  if (bedtimeTarget !== null && sleepBedtime !== null) {
    bedtimeResult = evaluateBedtime(
      new Date(sleepBedtime),
      bedtimeTarget.hour,
      bedtimeTarget.minute,
    );
  }

  const grade = calculateDailyGrade(morningPass, bedtimeResult);

  // bedtimeTarget を HH:mm 文字列に変換（DailyGradeRecord の形式）
  const bedtimeTargetStr =
    bedtimeTarget !== null
      ? `${String(bedtimeTarget.hour).padStart(2, '0')}:${String(bedtimeTarget.minute).padStart(2, '0')}`
      : null;

  return {
    date: dateStr,
    grade,
    morningPass,
    bedtimeResult,
    bedtimeTarget: bedtimeTargetStr,
    actualBedtime: sleepBedtime,
  };
}
