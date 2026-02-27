import {
  CategoryValueSleepAnalysis,
  isHealthDataAvailable,
  queryCategorySamples,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';

// biome-ignore lint/suspicious/noConsole: Health service errors need logging for debugging
const logError = console.error;

export interface SleepSummary {
  readonly bedtime: string; // ISO datetime
  readonly wakeUpTime: string; // ISO datetime
  readonly totalMinutes: number;
}

/**
 * HealthKit の SleepAnalysis 読み取り権限をリクエストする。
 * 成功時 true を返す。
 *
 * @kingstinct/react-native-healthkit は Android 用の no-op スタブを内蔵しており、
 * iOS 以外では isHealthDataAvailable() が false、requestAuthorization() が
 * Promise<false> を返すため、プラットフォーム分岐は不要。
 *
 * HealthKit はプライバシー上の理由から read 権限の拒否状態を隠蔽するため、
 * ユーザーが拒否しても true が返る場合がある。
 *
 * 呼び出し元: src/constants/permissions.ts, src/hooks/useDailySummary.ts, src/hooks/useGradeFinalization.ts
 */
export async function initHealthKit(): Promise<boolean> {
  if (!isHealthDataAvailable()) return false;

  try {
    return await requestAuthorization({
      toRead: ['HKCategoryTypeIdentifierSleepAnalysis'],
    });
  } catch (error) {
    logError('HealthKit authorization failed:', error);
    return false;
  }
}

/**
 * 指定日の睡眠データを HealthKit から取得する。
 * 前日 18:00 〜 当日 18:00 の範囲で INBED サンプルを集約し、
 * 最も早い就寝時刻と最も遅い起床時刻から SleepSummary を構築する。
 *
 * 睡眠は日をまたぐため（例: 23:00就寝→7:00起床）、当日 0:00 起点だと
 * 前日夜の就寝開始が範囲外になり睡眠セッション全体を取りこぼす恐れがある。
 *
 * 呼び出し元: src/hooks/useDailySummary.ts, src/hooks/useGradeFinalization.ts
 */
export async function getSleepSummary(date: Date): Promise<SleepSummary | null> {
  if (!isHealthDataAvailable()) return null;

  try {
    const startDate = new Date(date);
    startDate.setDate(startDate.getDate() - 1);
    startDate.setHours(18, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(18, 0, 0, 0);

    const samples = await queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
      limit: 0, // 0 = 全サンプル取得
      ascending: true,
      filter: {
        date: { startDate, endDate },
      },
    });

    if (samples.length === 0) return null;

    // INBED サンプルをフィルタ。見つからなければ全サンプルにフォールバック。
    const inBedSamples = samples.filter((s) => s.value === CategoryValueSleepAnalysis.inBed);
    const samplesToUse = inBedSamples.length > 0 ? inBedSamples : samples;

    let earliestStart: Date | null = null;
    let latestEnd: Date | null = null;

    for (const sample of samplesToUse) {
      // @kingstinct は Date オブジェクトを直接返す（ISO 文字列ではない）
      if (earliestStart === null || sample.startDate < earliestStart) {
        earliestStart = sample.startDate;
      }
      if (latestEnd === null || sample.endDate > latestEnd) {
        latestEnd = sample.endDate;
      }
    }

    if (earliestStart === null || latestEnd === null) return null;

    const totalMinutes = Math.round((latestEnd.getTime() - earliestStart.getTime()) / (1000 * 60));

    return {
      bedtime: earliestStart.toISOString(),
      wakeUpTime: latestEnd.toISOString(),
      totalMinutes,
    };
  } catch (error) {
    logError('Failed to get sleep summary:', error);
    return null;
  }
}
