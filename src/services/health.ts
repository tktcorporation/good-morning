import { Platform } from 'react-native';

// biome-ignore lint/suspicious/noConsole: Health service errors need logging for debugging
const logError = console.error;

export interface SleepSummary {
  readonly bedtime: string; // ISO datetime
  readonly wakeUpTime: string; // ISO datetime
  readonly totalMinutes: number;
}

/**
 * Safely get the AppleHealthKit instance.
 * Returns null if HealthKit is not available (Android, simulator, Expo Go).
 *
 * react-native-health は `module.exports = HealthKit` でエクスポートしており、
 * `export default` ではない。そのため `.default` ではなく require() の戻り値を
 * そのまま使う。Object.assign で NativeModule のメソッドがコピーされているため、
 * initHealthKit / getSleepSamples 等は直接呼び出せる。
 */
function getHealthKit(): import('react-native-health').AppleHealthKit | null {
  if (Platform.OS !== 'ios') {
    return null;
  }
  try {
    // Dynamic require to avoid crashes on Android/non-iOS platforms.
    // module.exports = HealthKit なので .default は不要（undefined になる）。
    const kit = require('react-native-health') as import('react-native-health').AppleHealthKit;
    // NativeModule が未リンクの場合、メソッドが存在しないことがある
    if (kit?.initHealthKit == null) {
      return null;
    }
    return kit;
  } catch {
    return null;
  }
}

let initialized = false;

/**
 * Check if HealthKit has been initialized in this session.
 */
export function isHealthKitInitialized(): boolean {
  return initialized;
}

/**
 * Initialize HealthKit and request read permission for SleepAnalysis.
 * Returns true if initialization succeeded, false otherwise.
 */
export async function initHealthKit(): Promise<boolean> {
  if (initialized) return true;

  const kit = getHealthKit();
  if (kit == null) {
    return false;
  }

  try {
    // HealthPermission enum は TypeScript 型定義（index.d.ts）にのみ存在し、
    // ランタイムの named export としては存在しない。
    // react-native-health の index.js は module.exports = HealthKit で全体を上書き
    // しているため、import { HealthPermission } では取得できない。
    // 実際の権限文字列は Constants.Permissions オブジェクトに格納されている。
    const { Constants } = require('react-native-health') as {
      Constants: import('react-native-health').Constants;
    };
    const permissions = {
      permissions: {
        read: [Constants.Permissions.SleepAnalysis],
        write: [] as import('react-native-health').HealthPermission[],
      },
    };

    return new Promise<boolean>((resolve) => {
      kit.initHealthKit(permissions, (error) => {
        if (error) {
          logError('HealthKit init failed:', error);
          initialized = false;
          resolve(false);
        } else {
          initialized = true;
          resolve(true);
        }
      });
    });
  } catch (error) {
    logError('HealthKit init error:', error);
    return false;
  }
}

/**
 * Query HealthKit for sleep samples (INBED type) for the given date.
 * Returns a SleepSummary with bedtime, wakeUpTime, and totalMinutes.
 * Returns null if no data is available or HealthKit is not initialized.
 */
export async function getSleepSummary(date: Date): Promise<SleepSummary | null> {
  const kit = getHealthKit();
  if (kit === null || !initialized) {
    return null;
  }

  try {
    // 前日 18:00 〜 当日 18:00 の範囲で取得する。
    // 睡眠は日をまたぐため（例: 23:00就寝→7:00起床）、当日 0:00 起点だと
    // 前日夜の就寝開始が範囲外になり睡眠セッション全体を取りこぼす恐れがある。
    const startDate = new Date(date);
    startDate.setDate(startDate.getDate() - 1);
    startDate.setHours(18, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(18, 0, 0, 0);

    const samples = await new Promise<ReadonlyArray<import('react-native-health').HealthValue>>(
      (resolve, reject) => {
        kit.getSleepSamples(
          {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
          (error, results) => {
            if (error) {
              reject(new Error(String(error)));
            } else {
              resolve(results);
            }
          },
        );
      },
    );

    if (samples.length === 0) {
      return null;
    }

    // Filter for INBED samples (value 0); fall back to all samples if none found
    const inBedSamples = samples.filter((s) => s.value === 0);
    const samplesToUse = inBedSamples.length > 0 ? inBedSamples : samples;

    // Find the earliest bedtime and latest wake time from INBED samples
    let earliestStart: Date | null = null;
    let latestEnd: Date | null = null;

    for (const sample of samplesToUse) {
      const sampleStart = new Date(sample.startDate);
      const sampleEnd = new Date(sample.endDate);

      if (earliestStart === null || sampleStart < earliestStart) {
        earliestStart = sampleStart;
      }
      if (latestEnd === null || sampleEnd > latestEnd) {
        latestEnd = sampleEnd;
      }
    }

    if (earliestStart === null || latestEnd === null) {
      return null;
    }

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
