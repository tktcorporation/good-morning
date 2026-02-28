/**
 * 未確定のグレードを自動確定するフック。
 *
 * 背景: DailyGradeRecord は夜の就寝データが必要なため、翌朝のアプリ起動時に確定する。
 * ダッシュボード画面で1回だけ実行される（モジュールスコープのフラグで制御）。
 *
 * 処理フロー:
 * 1. streak.lastGradedDate の翌日 〜 昨日までの全日を走査
 * 2. 各日の WakeRecord と HealthKit データからグレードを算出
 * 3. addGrade で永続化（ストリーク/フリーズも自動更新）
 *
 * 昨日分のみ HealthKit 睡眠データを取得し、それ以前の日はデータ取得コストが
 * 高く信頼性も低いため noData として扱う。最大7日分まで遡り、それ以前は無視する。
 *
 * 呼び出し元: app/(tabs)/index.tsx (ダッシュボード画面)
 * 不要になる条件: グレードシステムが廃止された場合
 */

import { useEffect, useRef } from 'react';
import { buildGradeRecord } from '../services/grade-finalizer';
import { getSleepSummary, initHealthKit } from '../services/health';
import { useDailyGradeStore } from '../stores/daily-grade-store';
import { useSettingsStore } from '../stores/settings-store';
import { useWakeRecordStore } from '../stores/wake-record-store';
import { useWakeTargetStore } from '../stores/wake-target-store';
import type { AlarmTime } from '../types/alarm';
import type { DailyGradeRecord } from '../types/daily-grade';
import type { WakeRecord } from '../types/wake-record';
import { formatDateString } from '../types/wake-record';

/**
 * モジュールスコープのフラグ。
 * アプリセッション中に1度だけ finalize 処理を走らせるためのガード。
 * re-render で useEffect が再実行されても二重処理を防ぐ。
 * テスト時にリセットできるよう export する。
 */
export let hasFinalized = false;

/** テスト用: hasFinalized フラグをリセットする */
export function resetFinalizationFlag(): void {
  hasFinalized = false;
}

/**
 * 確定対象の開始日を決定する。
 *
 * lastGradedDate があればその翌日、なければ昨日のみ。
 * 最大7日前にキャップして大量処理を防止する。
 */
function resolveStartDate(lastGradedDate: string | null, yesterday: Date): Date {
  let startDate: Date;
  if (lastGradedDate !== null) {
    startDate = new Date(`${lastGradedDate}T00:00:00`);
    startDate.setDate(startDate.getDate() + 1);
  } else {
    startDate = new Date(yesterday);
  }

  // 最大7日前までに制限（長期間アプリ未使用時の大量処理を防止）
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  if (startDate < sevenDaysAgo) {
    startDate = sevenDaysAgo;
  }

  return startDate;
}

/**
 * 昨日分のみ HealthKit から就寝時刻を取得する。
 * それ以前の日は HealthKit クエリのコストが高く信頼性も低いため取得しない。
 */
async function fetchSleepBedtime(
  dateStr: string,
  yesterdayStr: string,
  healthKitEnabled: boolean,
  date: Date,
): Promise<string | null> {
  if (dateStr !== yesterdayStr || !healthKitEnabled) return null;

  try {
    // @kingstinct/react-native-healthkit は初期化不要。
    // requestAuthorization は既に許可済みなら即成功する。
    await initHealthKit();
    const sleepData = await getSleepSummary(date);
    return sleepData?.bedtime ?? null;
  } catch {
    // HealthKit エラーはグレード確定をブロックしない
    return null;
  }
}

/**
 * 1日分のグレードを確定する。
 * 既にグレード確定済みならスキップし、未確定ならレコードを構築して addGrade する。
 */
async function finalizeDay(
  dateStr: string,
  yesterdayStr: string,
  records: readonly WakeRecord[],
  bedtimeTarget: AlarmTime | null,
  healthKitEnabled: boolean,
  date: Date,
  getGradeForDate: (d: string) => DailyGradeRecord | undefined,
  addGrade: (record: DailyGradeRecord) => Promise<void>,
): Promise<void> {
  if (getGradeForDate(dateStr) !== undefined) return;

  // WakeRecord が見つからない場合、buildGradeRecord は record=undefined として処理する。
  // これは「アラームが鳴ったが dismiss されなかった（missed）」ケースに相当し、
  // morningPass: false → grade は fair 以下になる。
  // WakeRecord の明示的な 'missed' 記録は作成しない（推論で十分なため）。
  const record = records.find((r) => r.date === dateStr);
  const sleepBedtime = await fetchSleepBedtime(dateStr, yesterdayStr, healthKitEnabled, date);
  const gradeRecord = buildGradeRecord(dateStr, record, bedtimeTarget, sleepBedtime);
  await addGrade(gradeRecord);
}

export function useGradeFinalization(): void {
  const gradeLoaded = useDailyGradeStore((s) => s.loaded);
  const streak = useDailyGradeStore((s) => s.streak);
  const addGrade = useDailyGradeStore((s) => s.addGrade);
  const getGradeForDate = useDailyGradeStore((s) => s.getGradeForDate);

  const records = useWakeRecordStore((s) => s.records);
  const recordsLoaded = useWakeRecordStore((s) => s.loaded);

  const target = useWakeTargetStore((s) => s.target);
  const targetLoaded = useWakeTargetStore((s) => s.loaded);

  const healthKitEnabled = useSettingsStore((s) => s.healthKitEnabled);

  // useRef で finalize 中かどうかを追跡し、並行実行を防止する
  const finalizingRef = useRef(false);

  useEffect(() => {
    if (!(gradeLoaded && recordsLoaded && targetLoaded)) return;
    if (hasFinalized) return;
    if (finalizingRef.current) return;

    hasFinalized = true;
    finalizingRef.current = true;

    const finalize = async () => {
      try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = formatDateString(yesterday);
        const startDate = resolveStartDate(streak.lastGradedDate, yesterday);
        const bedtimeTarget = target?.bedtimeTarget ?? null;

        // startDate 〜 yesterday の各日を走査
        const current = new Date(startDate);
        while (current <= yesterday) {
          const dateStr = formatDateString(current);
          await finalizeDay(
            dateStr,
            yesterdayStr,
            records,
            bedtimeTarget,
            healthKitEnabled,
            new Date(current),
            getGradeForDate,
            addGrade,
          );
          current.setDate(current.getDate() + 1);
        }
      } finally {
        finalizingRef.current = false;
      }
    };

    finalize();
  }, [
    gradeLoaded,
    recordsLoaded,
    targetLoaded,
    streak.lastGradedDate,
    records,
    target,
    healthKitEnabled,
    addGrade,
    getGradeForDate,
  ]);
}
