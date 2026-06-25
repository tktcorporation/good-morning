import { MINUTES_PER_DAY } from '../constants/time';
import type { AlarmTime } from '../types/alarm';

export const MIN_SLEEP_MINUTES = 300;
export const MAX_SLEEP_MINUTES = 600;
export const SLEEP_STEP_MINUTES = 30;

/**
 * アラーム時刻と目標睡眠時間から就寝目標時刻を算出する。
 * iOSヘルスケアの睡眠スケジュールと同じ考え方。
 *
 * 例: alarm 6:00 - 420分(7h) = 23:00
 * 深夜跨ぎは自動処理（負の分数に 1440 を加算）。
 */
export function calculateBedtime(
  alarmTime: AlarmTime,
  targetSleepMinutes: number | null,
): AlarmTime | null {
  if (targetSleepMinutes === null) return null;
  const alarmTotalMinutes = alarmTime.hour * 60 + alarmTime.minute;
  let bedtimeMinutes = alarmTotalMinutes - targetSleepMinutes;
  if (bedtimeMinutes < 0) bedtimeMinutes += MINUTES_PER_DAY;
  const hour = Math.floor(bedtimeMinutes / 60) % 24;
  const minute = bedtimeMinutes % 60;
  return { hour, minute };
}

/**
 * レガシーの bedtimeTarget + defaultTime から targetSleepMinutes を算出。
 * MIN〜MAX にクランプ。
 *
 * マイグレーション専用: bedtimeTarget (AlarmTime) を持つ旧データから
 * targetSleepMinutes (number) への変換に使用。新規コードでは不要。
 */
export function migrateBedtimeToSleepMinutes(
  bedtimeTarget: AlarmTime,
  defaultTime: AlarmTime,
): number {
  const alarmMinutes = defaultTime.hour * 60 + defaultTime.minute;
  const bedtimeMinutes = bedtimeTarget.hour * 60 + bedtimeTarget.minute;
  let diff = alarmMinutes - bedtimeMinutes;
  if (diff <= 0) diff += MINUTES_PER_DAY;
  return Math.max(MIN_SLEEP_MINUTES, Math.min(MAX_SLEEP_MINUTES, diff));
}

/**
 * 目標睡眠時間を表示用文字列に変換。例: 420 → "7h", 450 → "7.5h"
 */
export function formatSleepDuration(minutes: number): string {
  const hours = minutes / 60;
  return `${hours}h`;
}

/**
 * 睡眠時間（分）を時・分に分解する。例: 445 → { h: 7, m: 25 }。
 * i18n の「Xh Ym」表示テンプレートに渡す。
 */
export function splitDuration(totalMinutes: number): { h: number; m: number } {
  return { h: Math.floor(totalMinutes / 60), m: totalMinutes % 60 };
}

/**
 * ISO datetime 文字列を端末ローカルの "HH:MM" 表示に整形する。
 * 就寝・起床時刻の表示に使う。
 */
export function formatTimeFromIso(isoString: string): string {
  const date = new Date(isoString);
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}
