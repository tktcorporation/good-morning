/**
 * アラームのスケジュール・キャンセルを Effect で記述したサービス。
 *
 * 背景: alarm-scheduler.ts は getAlarmKit() の null チェックを各関数で行い、
 * 個別の try-catch でエラーを握り潰していた。Effect 化により：
 * - AlarmKit サービスへの依存が型で明示される
 * - エラーが AlarmKitError として伝播し、呼び出し元がハンドリング戦略を選択できる
 * - 各操作が Effect.gen で宣言的に記述される
 *
 * 呼び出し元: AlarmSyncService, SessionLifecycleService
 */

import { Effect } from 'effect';
import { toAlarmKitSoundName } from '../../constants/alarm-sounds';
import type { AlarmTime, DayOfWeek } from '../../types/alarm';
import type { WakeTarget } from '../../types/wake-target';
import { isNextOverrideExpired } from '../../types/wake-target';
import { AlarmKit, type AlarmKitError } from './AlarmKitService';

/** iOSの標準アラームと同じ9分間隔 */
export const SNOOZE_DURATION_SECONDS = 540;

/** 先行スケジュールするスヌーズの最大本数。9分 × 20 = 3時間分。 */
export const SNOOZE_MAX_COUNT = 20;

/**
 * DayOfWeek (0=Sunday) → iOS Calendar weekday (1=Sunday)
 */
function toIOSWeekday(day: DayOfWeek): number {
  return day + 1;
}

/**
 * 曜日ごとのアラーム時刻を解決し、OFF の曜日は null を返す。
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
 * 有効な曜日をアラーム時刻ごとにグルーピングする。
 * 同一時刻のアラームを1つの繰り返しアラームにまとめるため。
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

// ─── Effect 版スケジュール関数 ──────────────────────────────────

/**
 * WakeTarget の設定に基づいてアラームをスケジュールする。
 *
 * Effect 版: AlarmKit サービスを Context から取得し、
 * エラーは AlarmKitError として型レベルで追跡される。
 */
export const scheduleWakeTargetAlarm = (
  target: WakeTarget,
  previousIds: readonly string[],
  snoozeAlarmIds: readonly string[],
): Effect.Effect<readonly string[], AlarmKitError, AlarmKit> =>
  Effect.gen(function* () {
    const kit = yield* AlarmKit;

    // 前回の wake-target アラームをキャンセル
    yield* cancelAlarmsByIds(previousIds);

    // 孤立アラーム対策
    yield* cancelOrphanedWakeTargetAlarms(snoozeAlarmIds);

    if (!target.enabled) return [];

    // スヌーズ音名を App Groups に永続化
    const soundName = toAlarmKitSoundName(target.soundId);
    yield* kit.setSnoozeSoundName(soundName);

    const ids: string[] = [];
    const groups = groupDaysByTime(target);

    // 曜日グループごとに繰り返しアラームをスケジュール
    for (const [, { time, weekdays }] of groups) {
      const id = yield* kit.generateUUID;
      const success = yield* kit.scheduleRepeatingAlarm({
        id,
        hour: time.hour,
        minute: time.minute,
        weekdays,
        title: 'Good Morning',
        soundName,
      });
      if (success) ids.push(id);
    }

    // nextOverride がある場合はワンショットアラームを追加
    if (target.nextOverride !== null && !isNextOverrideExpired(target.nextOverride)) {
      const id = yield* kit.generateUUID;
      const now = new Date();
      const alarmDate = new Date(now);
      alarmDate.setHours(target.nextOverride.time.hour, target.nextOverride.time.minute, 0, 0);
      if (alarmDate.getTime() <= now.getTime()) {
        alarmDate.setDate(alarmDate.getDate() + 1);
      }
      const epochSeconds = Math.floor(alarmDate.getTime() / 1000);
      const success = yield* kit.scheduleAlarm({
        id,
        epochSeconds,
        title: 'Good Morning',
        soundName,
      });
      if (success) ids.push(id);
    }

    return ids;
  });

/**
 * スヌーズアラームを先行スケジュールする。
 * 9分間隔で count 本のアラームを登録する。
 */
export const scheduleSnoozeAlarms = (
  baseTime: Date,
  count: number = SNOOZE_MAX_COUNT,
  soundName?: string,
): Effect.Effect<readonly string[], AlarmKitError, AlarmKit> =>
  Effect.gen(function* () {
    const kit = yield* AlarmKit;
    const ids: string[] = [];

    for (let i = 1; i <= count; i++) {
      const id = yield* kit.generateUUID;
      const snoozeDate = new Date(baseTime.getTime() + SNOOZE_DURATION_SECONDS * 1000 * i);
      const epochSeconds = Math.floor(snoozeDate.getTime() / 1000);

      // 個別のスケジュール失敗はスキップして残りを続行
      const result = yield* Effect.either(
        kit.scheduleAlarm({
          id,
          epochSeconds,
          title: 'Good Morning',
          soundName,
          dismissPayload: JSON.stringify({ isSnooze: true }),
        }),
      );
      if (result._tag === 'Right' && result.right) {
        ids.push(id);
      }
    }

    return ids;
  });

/**
 * 全アラームをキャンセルする。
 * セッション非アクティブ時のみ安全に使用できる。
 */
export const cancelAllAlarms: Effect.Effect<void, AlarmKitError, AlarmKit> = Effect.gen(
  function* () {
    const kit = yield* AlarmKit;
    const existing = yield* kit.getAllAlarms;
    yield* Effect.all(
      existing.map((id) => kit.cancelAlarm(id)),
      { concurrency: 'unbounded' },
    );
  },
);

/**
 * 指定 ID のアラームのみをキャンセルする。
 */
export const cancelAlarmsByIds = (
  ids: readonly string[],
): Effect.Effect<void, AlarmKitError, AlarmKit> =>
  Effect.gen(function* () {
    if (ids.length === 0) return;
    const kit = yield* AlarmKit;
    yield* Effect.all(
      ids.map((id) => kit.cancelAlarm(id)),
      { concurrency: 'unbounded' },
    );
  });

/**
 * 孤立した wake-target アラームを検出・キャンセルする。
 * snoozeAlarmIds に含まれないアラームが孤立とみなされる。
 */
const cancelOrphanedWakeTargetAlarms = (
  snoozeAlarmIds: readonly string[],
): Effect.Effect<void, AlarmKitError, AlarmKit> =>
  Effect.gen(function* () {
    const kit = yield* AlarmKit;
    const allAlarms = yield* kit.getAllAlarms;
    const snoozeSet = new Set(snoozeAlarmIds);
    const orphanedIds = allAlarms.filter((id) => !snoozeSet.has(id));
    if (orphanedIds.length > 0) {
      yield* Effect.all(
        orphanedIds.map((id) => kit.cancelAlarm(id)),
        { concurrency: 'unbounded' },
      );
    }
  });
