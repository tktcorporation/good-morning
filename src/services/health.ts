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
 */
function getHealthKit(): import('react-native-health').AppleHealthKit | null {
  if (Platform.OS !== 'ios') {
    return null;
  }
  try {
    // Dynamic require to avoid crashes on Android/non-iOS platforms
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AppleHealthKit = require('react-native-health')
      .default as import('react-native-health').AppleHealthKit;
    return AppleHealthKit;
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
  const kit = getHealthKit();
  if (kit === null) {
    return false;
  }

  try {
    const { HealthPermission } = await import('react-native-health');
    const permissions = {
      permissions: {
        read: [HealthPermission.SleepAnalysis],
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
    // Query sleep samples for the day (midnight to midnight)
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

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

    // Find the earliest bedtime and latest wake time from INBED samples
    let earliestStart: Date | null = null;
    let latestEnd: Date | null = null;

    for (const sample of samples) {
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
