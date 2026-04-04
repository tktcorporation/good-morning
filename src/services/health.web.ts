/**
 * HealthKit の Web 用 no-op スタブ。
 *
 * @kingstinct/react-native-healthkit は Web 非対応のため、
 * 全関数が「データなし」を返す。extractMainSleepSession はピュアロジックなので
 * ネイティブ版からそのまま利用可能だが、Web で呼ばれることはない。
 */

export interface SleepSummary {
  readonly bedtime: string;
  readonly wakeUpTime: string;
  readonly totalMinutes: number;
}

export async function initHealthKit(): Promise<boolean> {
  return false;
}

interface SleepSession {
  readonly start: Date;
  readonly end: Date;
  readonly totalMinutes: number;
}

export function extractMainSleepSession(
  _samples: ReadonlyArray<{ readonly startDate: Date; readonly endDate: Date }>,
): SleepSession | null {
  return null;
}

export async function getSleepSummary(_date: Date): Promise<SleepSummary | null> {
  return null;
}
