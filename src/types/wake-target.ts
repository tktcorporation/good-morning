import { DEFAULT_SOUND_ID } from '../constants/alarm-sounds';
import type { AlarmTime, DayOfWeek, TodoItem } from './alarm';

export type DayOverride =
  | { readonly type: 'custom'; readonly time: AlarmTime }
  | { readonly type: 'off' };

/**
 * 「明日だけ」のアラーム時刻オーバーライド。
 * targetDate を過ぎたら自動的にクリアされる（loadTarget 時に判定）。
 */
export interface NextOverride {
  readonly time: AlarmTime;
  /** オーバーライド対象日 (YYYY-MM-DD)。この日の time を過ぎたら期限切れとみなす。 */
  readonly targetDate: string;
}

export interface WakeTarget {
  readonly defaultTime: AlarmTime;
  readonly dayOverrides: Partial<Readonly<Record<DayOfWeek, DayOverride>>>;
  readonly nextOverride: NextOverride | null;
  readonly todos: readonly TodoItem[];
  readonly enabled: boolean;
  readonly soundId: string;
  /**
   * 目標就寝時刻。Daily Grade System で夜の評価に使用。
   * null = 未設定（夜の判定は常に noData → 最大 good まで）。
   * excellent を取るには HealthKit 連携 + この値の設定が必要。
   */
  readonly bedtimeTarget: AlarmTime | null;
}

/**
 * Resolve the alarm time for a given date.
 * Priority: nextOverride > dayOverride > defaultTime.
 * Returns null if the day is set to OFF.
 */
export function resolveTimeForDate(target: WakeTarget, date: Date): AlarmTime | null {
  if (target.nextOverride !== null) {
    return target.nextOverride.time;
  }

  const dayOfWeek = date.getDay() as DayOfWeek;
  const override = target.dayOverrides[dayOfWeek];

  if (override !== undefined) {
    if (override.type === 'off') {
      return null;
    }
    return override.time;
  }

  return target.defaultTime;
}

/**
 * nextOverride が期限切れかどうかを判定する。
 * targetDate が存在しない（レガシーデータ）場合も期限切れとみなす。
 */
export function isNextOverrideExpired(override: NextOverride, now: Date = new Date()): boolean {
  if (override.targetDate === undefined || override.targetDate === '') {
    return true;
  }
  const [year, month, day] = override.targetDate.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return true;

  const expiresAt = new Date(year, month - 1, day, override.time.hour, override.time.minute, 0);
  return now.getTime() > expiresAt.getTime();
}

/**
 * setNextOverride 用: 現在時刻からオーバーライド対象日を算出する。
 * scheduleWakeTargetAlarm と同じロジック — 時刻が今日を過ぎていれば明日、そうでなければ今日。
 */
export function computeOverrideTargetDate(time: AlarmTime, now: Date = new Date()): string {
  const alarmDate = new Date(now);
  alarmDate.setHours(time.hour, time.minute, 0, 0);
  if (alarmDate.getTime() <= now.getTime()) {
    alarmDate.setDate(alarmDate.getDate() + 1);
  }
  const y = alarmDate.getFullYear();
  const m = String(alarmDate.getMonth() + 1).padStart(2, '0');
  const d = String(alarmDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const DEFAULT_WAKE_TARGET: WakeTarget = {
  defaultTime: { hour: 7, minute: 0 },
  dayOverrides: {},
  nextOverride: null,
  todos: [],
  enabled: true,
  soundId: DEFAULT_SOUND_ID,
  bedtimeTarget: null,
};
