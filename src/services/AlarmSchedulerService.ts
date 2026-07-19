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
import { SNOOZE_DURATION_SECONDS, SNOOZE_MAX_COUNT } from '../constants/alarm-timing';
import type { AlarmTime, DayOfWeek } from '../types/alarm';
import type { WakeTarget } from '../types/wake-target';
import { isNextOverrideExpired } from '../types/wake-target';
import { AlarmKit, type AlarmKitError } from './AlarmKitService';
import { AlarmKitOperationError } from './errors';

// スヌーズ間隔・本数は TODO リマインドと同じケイデンスを共有するため
// constants/alarm-timing に集約。既存の import 元（services/index.ts・テスト）を
// 保つため、ここから再エクスポートする。
export { SNOOZE_DURATION_SECONDS, SNOOZE_MAX_COUNT };

/**
 * DayOfWeek (0=Sunday) → iOS Calendar weekday (1=Sunday)
 */
function toIOSWeekday(day: DayOfWeek): number {
  return day + 1;
}

/**
 * nextOverride の対象日を Date として解決する（時刻は 00:00）。
 * 期限切れ・破損 targetDate（isNextOverrideExpired が拾いきれない
 * NaN 以外の形状異常を含む）は null。
 */
function resolveNextOverrideDate(target: WakeTarget): Date | null {
  if (target.nextOverride === null || isNextOverrideExpired(target.nextOverride)) return null;
  const [year, month, day] = target.nextOverride.targetDate.split('-').map(Number);
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null;
  }
  return new Date(year, month - 1, day);
}

/**
 * 曜日ごとのアラーム時刻を解決し、OFF の曜日は null を返す。
 *
 * nextOverride 対象日の曜日も繰り返しアラームの対象から除外しない
 * （= override 日はデフォルト/dayOverride 時刻と override 時刻の両方が鳴りうる）。
 * 除外すると、iOS が dismiss 時にアプリを起動せず次回のアプリ起動まで
 * syncAlarmsEffect が走らないケース（RecoveryService が前提とする状況）で、
 * 次にアプリが起動されるまでその曜日の繰り返しアラームが丸ごと消える
 * リスクを負う。「鳴らない」方が「余計に鳴る」より実害が大きいため、
 * 繰り返し側は常に維持する。
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
 * nextOverride のワンショットアラームをスケジュールする。
 * 有効な nextOverride がなければ何もしない（null を返す）。
 *
 * 対象日は保存済みの targetDate を使う。now からの再計算は「明日だけ」の
 * 対象日とズレる（指定時刻が未到来だと当日に載る）ため使わない。
 * 登録が拒否された（false）場合は静かに握らず失敗として伝える。
 */
const scheduleNextOverrideAlarm = (
  target: WakeTarget,
): Effect.Effect<string | null, AlarmKitError, AlarmKit> =>
  Effect.gen(function* () {
    const overrideDate = resolveNextOverrideDate(target);
    if (overrideDate === null || target.nextOverride === null) return null;
    const { time } = target.nextOverride;
    const alarmDate = new Date(overrideDate);
    alarmDate.setHours(time.hour, time.minute, 0, 0);
    if (alarmDate.getTime() <= Date.now()) return null;

    const kit = yield* AlarmKit;
    const id = yield* kit.generateUUID;
    const epochSeconds = Math.floor(alarmDate.getTime() / 1000);
    const success = yield* kit.scheduleAlarm({ id, epochSeconds, title: 'Good Morning' });
    if (!success) {
      return yield* Effect.fail(new AlarmKitOperationError({ operation: 'scheduleAlarm' }));
    }
    return id;
  });

/**
 * 曜日グループの繰り返しアラームと nextOverride のワンショットを登録する。
 *
 * false（登録拒否）もエラーと同様に失敗として扱う。黙って握ると
 * その曜日グループだけ静かに鳴らなくなる。
 * 失敗した時点で登録を打ち切り、そこまでの登録済み ID と失敗を返す
 * （ロールバック判断は呼び出し元が行う）。
 */
const scheduleNewAlarms = (
  target: WakeTarget,
): Effect.Effect<{ newIds: string[]; failure: AlarmKitError | null }, never, AlarmKit> =>
  Effect.gen(function* () {
    const kit = yield* AlarmKit;
    const newIds: string[] = [];

    // 曜日グループごとに繰り返しアラームをスケジュール（音は AlarmKit の OS デフォルト）
    for (const [, { time, weekdays }] of groupDaysByTime(target)) {
      const id = yield* kit.generateUUID;
      const result = yield* Effect.either(
        kit.scheduleRepeatingAlarm({
          id,
          hour: time.hour,
          minute: time.minute,
          weekdays,
          title: 'Good Morning',
        }),
      );
      if (result._tag === 'Left') {
        return { newIds, failure: result.left };
      }
      if (!result.right) {
        return {
          newIds,
          failure: new AlarmKitOperationError({ operation: 'scheduleRepeatingAlarm' }),
        };
      }
      newIds.push(id);
    }

    // nextOverride がある場合はワンショットアラームを追加
    const overrideResult = yield* Effect.either(scheduleNextOverrideAlarm(target));
    if (overrideResult._tag === 'Left') {
      return { newIds, failure: overrideResult.left };
    }
    if (overrideResult.right !== null) newIds.push(overrideResult.right);

    return { newIds, failure: null };
  });

/**
 * WakeTarget の設定に基づいてアラームをスケジュールする。
 *
 * 処理順序は「先に新規登録 → 成功後に旧・孤立アラームを掃除」。
 * 逆順（先キャンセル）だと、ネイティブの一時的な失敗 1 回で旧アラーム消滅・
 * 新アラームなしの「0 本」状態になり、翌朝何も鳴らなくなる。
 * 登録フェーズが 1 つでも失敗した場合は新規分をロールバックして旧アラームを
 * 温存し、エラーを呼び出し元へ伝える。掃除フェーズの失敗は握って newIds を
 * 返す（次回 sync の孤立掃除で自然に回収されるため、ここで呼び出し元への
 * エラー伝播を優先すると store が更新されず不整合が固定化してしまう）。
 */
export const scheduleWakeTargetAlarm = (
  target: WakeTarget,
  previousIds: readonly string[],
  snoozeAlarmIds: readonly string[],
): Effect.Effect<readonly string[], AlarmKitError, AlarmKit> =>
  Effect.gen(function* () {
    if (!target.enabled) {
      yield* cancelAlarmsByIds(previousIds);
      yield* cancelAlarmsExcept(snoozeAlarmIds);
      return [];
    }

    // ─── 1. 新しいアラームを先に登録する ───
    const { newIds, failure } = yield* scheduleNewAlarms(target);

    if (failure !== null) {
      // ロールバック: 登録できた新規分を取り消し、旧アラームには触れない。
      // ロールバック自体の失敗は握る（元の失敗を優先して伝える）
      yield* cancelAlarmsByIds(newIds).pipe(Effect.catchAll(() => Effect.void));
      return yield* Effect.fail(failure);
    }

    // ─── 2. 成功後に旧アラーム・孤立アラームを掃除する ───
    // 掃除の失敗は握って newIds を返す。ここで Effect を失敗させると、
    // 新アラームは登録済みなのに呼び出し元（syncAlarmsEffect）が
    // setAlarmIds(newIds) を呼ばず store が旧 ID のまま固定化し、
    // ネイティブとの不整合が残り続ける。掃除の取りこぼしは次回 sync の
    // 孤立アラーム掃除（cancelAlarmsExcept）で自然に回収される
    yield* cancelAlarmsByIds(previousIds).pipe(Effect.catchAll(() => Effect.void));
    yield* cancelAlarmsExcept([...snoozeAlarmIds, ...newIds]).pipe(
      Effect.catchAll(() => Effect.void),
    );

    return newIds;
  });

/**
 * baseTime を基準に、次に発火する（now より未来の）スヌーズ時刻を計算する。
 *
 * scheduleSnoozeAlarms の過去 epoch スキップと同じ間隔計算を、呼び出し元が
 * 「実際に何分後のスヌーズが最初に鳴るか」を知るために独立して使う
 * （setSnoozeState の snoozeFiresAt をここから算出する）。
 */
export function nextSnoozeFireTime(baseTime: Date, now: Date = new Date()): Date {
  let candidate = new Date(baseTime.getTime() + SNOOZE_DURATION_SECONDS * 1000);
  while (candidate.getTime() <= now.getTime()) {
    candidate = new Date(candidate.getTime() + SNOOZE_DURATION_SECONDS * 1000);
  }
  return candidate;
}

/**
 * スヌーズアラームを先行スケジュールする。
 * 9分間隔で count 本のアラームを登録する。
 */
export const scheduleSnoozeAlarms = (
  baseTime: Date,
  count: number = SNOOZE_MAX_COUNT,
): Effect.Effect<readonly string[], AlarmKitError, AlarmKit> =>
  Effect.gen(function* () {
    const kit = yield* AlarmKit;
    const ids: string[] = [];
    const nowMs = Date.now();

    for (let i = 1; i <= count; i++) {
      const snoozeDate = new Date(baseTime.getTime() + SNOOZE_DURATION_SECONDS * 1000 * i);
      // 遅延リカバリ（dismiss の数十分後にアプリを開いた等）では基準時刻が
      // 過去になる。過ぎた時刻のスヌーズをネイティブに渡さない
      if (snoozeDate.getTime() <= nowMs) continue;

      const id = yield* kit.generateUUID;
      const epochSeconds = Math.floor(snoozeDate.getTime() / 1000);

      // 個別のスケジュール失敗はスキップして残りを続行
      const result = yield* Effect.either(
        kit.scheduleAlarm({
          id,
          epochSeconds,
          title: 'Good Morning',
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
 * keepAlarmIds 以外の全アラームをキャンセルする。
 *
 * 孤立アラーム（ストアが把握していない登録済みアラーム）の掃除と、
 * 「セッションのスヌーズだけ残して全消し」（target 無効化時）の両方で使う。
 */
export const cancelAlarmsExcept = (
  keepAlarmIds: readonly string[],
): Effect.Effect<void, AlarmKitError, AlarmKit> =>
  Effect.gen(function* () {
    const kit = yield* AlarmKit;
    const allAlarms = yield* kit.getAllAlarms;
    const keepSet = new Set(keepAlarmIds);
    const orphanedIds = allAlarms.filter((id) => !keepSet.has(id));
    if (orphanedIds.length > 0) {
      yield* Effect.all(
        orphanedIds.map((id) => kit.cancelAlarm(id)),
        { concurrency: 'unbounded' },
      );
    }
  });
