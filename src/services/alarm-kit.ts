import type { AlarmTime, DayOfWeek } from '../types/alarm';
import type { WakeTarget } from '../types/wake-target';

export const APP_GROUP_ID = 'group.com.tktcorporation.goodmorning';

// biome-ignore lint/suspicious/noConsole: AlarmKit errors need logging for debugging
const logError = console.error;
// biome-ignore lint/suspicious/noConsole: AlarmKit availability needs logging
const logWarn = console.warn;

// Lazy-load expo-alarm-kit to avoid crash when native module is unavailable
type AlarmKitModule = typeof import('expo-alarm-kit');
let alarmKit: AlarmKitModule | null = null;
let alarmKitChecked = false;

function getAlarmKit(): AlarmKitModule | null {
  if (alarmKitChecked) return alarmKit;
  alarmKitChecked = true;
  try {
    alarmKit = require('expo-alarm-kit') as AlarmKitModule;
    return alarmKit;
  } catch {
    logWarn('[AlarmKit] Native module not available — alarm scheduling disabled');
    return null;
  }
}

export function isAlarmKitAvailable(): boolean {
  return getAlarmKit() !== null;
}

export interface LaunchPayload {
  alarmId: string;
  payload: string | null;
}

export async function initializeAlarmKit(): Promise<'authorized' | 'denied'> {
  const kit = getAlarmKit();
  if (kit === null) return 'denied';

  const configured = kit.configure(APP_GROUP_ID);
  if (!configured) {
    logError('[AlarmKit] Failed to configure App Group');
    return 'denied';
  }
  const status = await kit.requestAuthorization();
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

  const kit = getAlarmKit();
  if (kit === null || !target.enabled) return [];

  const ids: string[] = [];
  const alarmTitle = 'Good Morning';

  // Schedule repeating alarms grouped by time
  const groups = groupDaysByTime(target);
  for (const [, { time, weekdays }] of groups) {
    const id = kit.generateUUID();
    const success = await kit.scheduleRepeatingAlarm({
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
    const id = kit.generateUUID();
    const now = new Date();
    const alarmDate = new Date(now);
    alarmDate.setHours(target.nextOverride.time.hour, target.nextOverride.time.minute, 0, 0);
    // If the time has already passed today, schedule for tomorrow
    if (alarmDate.getTime() <= now.getTime()) {
      alarmDate.setDate(alarmDate.getDate() + 1);
    }
    const epochSeconds = Math.floor(alarmDate.getTime() / 1000);

    const success = await kit.scheduleAlarm({
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

export const SNOOZE_DURATION_SECONDS = 540; // 9 minutes

export async function scheduleSnooze(): Promise<string | null> {
  const kit = getAlarmKit();
  if (kit === null) return null;

  const id = kit.generateUUID();
  const now = new Date();
  const snoozeDate = new Date(now.getTime() + SNOOZE_DURATION_SECONDS * 1000);
  const epochSeconds = Math.floor(snoozeDate.getTime() / 1000);

  try {
    const success = await kit.scheduleAlarm({
      id,
      epochSeconds,
      title: 'Good Morning',
      launchAppOnDismiss: true,
      dismissPayload: JSON.stringify({ isSnooze: true }),
    });
    return success ? id : null;
  } catch {
    return null;
  }
}

export async function cancelSnooze(alarmId: string): Promise<void> {
  const kit = getAlarmKit();
  if (kit === null) return;
  await kit.cancelAlarm(alarmId);
}

export async function cancelAllAlarms(): Promise<void> {
  const kit = getAlarmKit();
  if (kit === null) return;

  const existing = kit.getAllAlarms();
  const cancellations = existing.map((id) => kit.cancelAlarm(id));
  await Promise.all(cancellations);
}

export function checkLaunchPayload(): LaunchPayload | null {
  const kit = getAlarmKit();
  if (kit === null) return null;
  return kit.getLaunchPayload();
}
