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

interface SleepSession {
  readonly start: Date;
  readonly end: Date;
  readonly totalMinutes: number;
}

/**
 * 睡眠サンプルの間隔がこの閾値（分）を超えたら別セッションとみなす。
 * 昼寝（17:00-19:00）と夜の睡眠（0:00-9:00）のように5時間以上の
 * ギャップがある場合に確実に分離するため、60分に設定。
 * トイレ等の短時間の中断（〜30分程度）は同一セッションとして扱う。
 */
const SESSION_GAP_THRESHOLD_MINUTES = 60;

/**
 * 睡眠サンプル群をギャップで分離し、最も長いセッション（= 主睡眠）を返す。
 *
 * 背景: HealthKit は昼寝と夜の睡眠を別々のサンプルとして記録するが、
 * 単純に最早開始〜最遅終了を取ると間の起床時間（例: 19:00-0:00の5時間）が
 * 睡眠時間に含まれてしまう。
 * セッション分離により、最も長い連続睡眠区間のみを主睡眠として採用する。
 *
 * @param samples - startDate 昇順にソート済みの睡眠サンプル
 */
export function extractMainSleepSession(
  samples: ReadonlyArray<{ readonly startDate: Date; readonly endDate: Date }>,
): SleepSession | null {
  if (samples.length === 0) return null;

  // サンプルを startDate 昇順にソート（念のため）
  const sorted = [...samples].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  const sessions: SleepSession[] = [];
  const first = sorted[0];
  if (first === undefined) return null;
  let sessionStart = first.startDate;
  let sessionEnd = first.endDate;

  for (let i = 1; i < sorted.length; i++) {
    const sample = sorted[i];
    if (sample === undefined) continue;
    const gapMinutes = (sample.startDate.getTime() - sessionEnd.getTime()) / (1000 * 60);

    if (gapMinutes > SESSION_GAP_THRESHOLD_MINUTES) {
      // 新しいセッション開始 → 現在のセッションを確定
      sessions.push({
        start: sessionStart,
        end: sessionEnd,
        totalMinutes: Math.round((sessionEnd.getTime() - sessionStart.getTime()) / (1000 * 60)),
      });
      sessionStart = sample.startDate;
      sessionEnd = sample.endDate;
    } else {
      // 同一セッション内 → 終了時刻を延長
      if (sample.endDate > sessionEnd) {
        sessionEnd = sample.endDate;
      }
    }
  }

  // 最後のセッションを追加
  sessions.push({
    start: sessionStart,
    end: sessionEnd,
    totalMinutes: Math.round((sessionEnd.getTime() - sessionStart.getTime()) / (1000 * 60)),
  });

  // 最も長いセッションを主睡眠として返す
  let longest: SleepSession | null = null;
  for (const session of sessions) {
    if (longest === null || session.totalMinutes > longest.totalMinutes) {
      longest = session;
    }
  }

  return longest;
}

/**
 * 指定日の睡眠データを HealthKit から取得する。
 * 前日 18:00 〜 当日 18:00 の範囲で INBED サンプルを集約し、
 * 主睡眠セッション（最も長い連続睡眠区間）から SleepSummary を構築する。
 *
 * 昼寝と夜の睡眠が別々に記録される場合（例: 17:00-19:00 + 0:00-9:00）、
 * 間の起床時間を睡眠に含めないようセッション分離を行う。
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

    const mainSession = extractMainSleepSession(samplesToUse);
    if (mainSession === null) return null;

    return {
      bedtime: mainSession.start.toISOString(),
      wakeUpTime: mainSession.end.toISOString(),
      totalMinutes: mainSession.totalMinutes,
    };
  } catch (error) {
    logError('Failed to get sleep summary:', error);
    return null;
  }
}
