import type { LaunchPayload } from 'expo-alarm-kit';
import {
  cancelAlarm,
  configure,
  generateUUID,
  getAllAlarms,
  getLaunchPayload,
  requestAuthorization,
  scheduleAlarm,
  scheduleRepeatingAlarm,
} from 'expo-alarm-kit';

import type { AlarmTime, DayOfWeek } from '../types/alarm';
import type { WakeTarget } from '../types/wake-target';

export const APP_GROUP_ID = 'group.com.tktcorporation.goodmorning';

// biome-ignore lint/suspicious/noConsole: AlarmKit errors need logging for debugging
const logError = console.error;

export async function initializeAlarmKit(): Promise<'authorized' | 'denied'> {
  const configured = configure(APP_GROUP_ID);
  if (!configured) {
    logError('[AlarmKit] Failed to configure App Group');
    return 'denied';
  }
  const status = await requestAuthorization();
  return status === 'authorized' ? 'authorized' : 'denied';
}

/**
 * Convert DayOfWeek (0=Sunday, 1=Monday, ..., 6=Saturday)
 * to iOS Calendar weekday (1=Sunday, 2=Monday, ..., 7=Saturday)
 */
function toIOSWeekday(day: DayOfWeek): number {
  return day + 1;
}

/**
 * Resolve the alarm time for a specific day, considering overrides.
 * Returns null if the day is set to OFF.
 */
function resolveTimeForDay(target: WakeTarget, day: DayOfWeek): AlarmTime | null {
  const override = target.dayOverrides[day];
  if (override !== undefined) {
    if (override.type === 'off') return null;
    return override.time;
  }
  return target.defaultTime;
}

/**
 * Group enabled days by their resolved time so we can schedule
 * one repeating alarm per unique time.
 */
function groupDaysByTime(
  target: WakeTarget,
): ReadonlyMap<string, { time: AlarmTime; weekdays: number[] }> {
  const groups = new Map<string, { time: AlarmTime; weekdays: number[] }>();
  for (let d = 0; d < 7; d++) {
    const day = d as DayOfWeek;
    const time = resolveTimeForDay(target, day);
    if (time === null) continue;
    const key = `${time.hour}:${time.minute}`;
    const existing = groups.get(key);
    if (existing !== undefined) {
      existing.weekdays.push(toIOSWeekday(day));
    } else {
      groups.set(key, { time, weekdays: [toIOSWeekday(day)] });
    }
  }
  return groups;
}

export async function scheduleWakeTargetAlarm(target: WakeTarget): Promise<readonly string[]> {
  // Cancel all existing alarms first
  await cancelAllAlarms();

  if (!target.enabled) return [];

  const ids: string[] = [];
  const alarmTitle = 'Good Morning';

  // Schedule repeating alarms grouped by time
  const groups = groupDaysByTime(target);
  for (const [, { time, weekdays }] of groups) {
    const id = generateUUID();
    const success = await scheduleRepeatingAlarm({
      id,
      hour: time.hour,
      minute: time.minute,
      weekdays,
      title: alarmTitle,
      soundName: target.soundId !== 'default' ? `${target.soundId}.mp3` : undefined,
      launchAppOnDismiss: true,
    });
    if (success) ids.push(id);
  }

  // Schedule one-time alarm for nextOverride
  if (target.nextOverride !== null) {
    const id = generateUUID();
    const now = new Date();
    const alarmDate = new Date(now);
    alarmDate.setHours(target.nextOverride.time.hour, target.nextOverride.time.minute, 0, 0);
    // If the time has already passed today, schedule for tomorrow
    if (alarmDate.getTime() <= now.getTime()) {
      alarmDate.setDate(alarmDate.getDate() + 1);
    }
    const epochSeconds = Math.floor(alarmDate.getTime() / 1000);

    const success = await scheduleAlarm({
      id,
      epochSeconds,
      title: alarmTitle,
      soundName: target.soundId !== 'default' ? `${target.soundId}.mp3` : undefined,
      launchAppOnDismiss: true,
    });
    if (success) ids.push(id);
  }

  return ids;
}

export async function cancelAllAlarms(): Promise<void> {
  const existing = getAllAlarms();
  const cancellations = existing.map((id) => cancelAlarm(id));
  await Promise.all(cancellations);
}

export function checkLaunchPayload(): LaunchPayload | null {
  return getLaunchPayload();
}
