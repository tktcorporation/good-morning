/**
 * アラームのスケジュール・キャンセル操作を担うモジュール。
 *
 * 背景: alarm-kit.ts に5つの関心事（初期化・スケジュール・Live Activity・
 * dismiss イベント・ウィジェット同期）が混在していた。スケジュール/キャンセル
 * 操作を分離することで、各モジュールの責務を明確にする。
 *
 * 依存: getAlarmKit() を alarm-kit.ts から import して AlarmKit ネイティブモジュールにアクセスする。
 * 循環 import なし: alarm-scheduler → alarm-kit（OK）、alarm-kit → alarm-scheduler（なし）
 */

import type { AlarmTime, DayOfWeek } from '../types/alarm';
import type { WakeTarget } from '../types/wake-target';
import { isNextOverrideExpired } from '../types/wake-target';
import { getAlarmKit, setSnoozeSoundName } from './alarm-kit';

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

/**
 * WakeTarget の設定に基づいてアラームをスケジュールする。
 *
 * 設計: AlarmKit に登録されている全アラームを cancelAllAlarms() でクリアしてから
 * 新規スケジュールする。cancelAlarmsByIds(previousIds) を使っていた旧設計では、
 * alarmIds が消失（再インストール・AsyncStorage クリア等）した場合に孤立アラームが
 * 蓄積し、同一時刻に複数のアラームが即座に連続発火する問題があった。
 *
 * 前提: セッション非アクティブ時のみ呼ばれる（_layout.tsx の isActive() ガード）。
 * スヌーズアラームがアクティブな間は呼ばれないため、全削除しても安全。
 *
 * @param target アラーム設定
 */
export async function scheduleWakeTargetAlarm(target: WakeTarget): Promise<readonly string[]> {
  // AlarmKit に登録されている全アラームを削除してから再スケジュール。
  // ID ベースのキャンセルと異なり、孤立アラームを確実に除去できる。
  await cancelAllAlarms();

  const kit = getAlarmKit();
  if (kit === null || !target.enabled) return [];

  // ネイティブ dismiss 時のスヌーズスケジュールで使う音名を App Groups に永続化する。
  // アプリ未起動でもネイティブ側がこの値を読み取ってユーザー選択の音でスヌーズを鳴らす。
  const soundName = target.soundId !== 'default' ? `${target.soundId}.mp3` : undefined;
  setSnoozeSoundName(soundName);

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
      soundName,
      launchAppOnDismiss: true,
      // doSnoozeIntent は設定しない。
      // JS 側で scheduleSnoozeAlarms() により 9 分間隔のスヌーズを先行スケジュール済み。
      // ネイティブスヌーズを有効にすると、ユーザーが誤って「スヌーズ」ボタンを押した場合に
      // JS 管理外のアラームが発火し、dismiss しても止まらない連続鳴動が発生していた。
    });
    if (success) ids.push(id);
  }

  // Schedule one-time alarm for nextOverride（期限切れは除外）
  if (target.nextOverride !== null && !isNextOverrideExpired(target.nextOverride)) {
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
      soundName,
      launchAppOnDismiss: true,
    });
    if (success) ids.push(id);
  }

  return ids;
}

/**
 * iOSの標準アラームと同じ9分間隔。
 * 由来: 機械式時計時代の歯車制約から生まれた慣習で、ユーザーにとって馴染みのある間隔。
 */
export const SNOOZE_DURATION_SECONDS = 540;

/** 先行スケジュールするスヌーズの最大本数。9分 × 20 = 3時間分。 */
export const SNOOZE_MAX_COUNT = 20;

/**
 * メインアラームの dismissTime を基準に、9分間隔でスヌーズアラームを先行スケジュールする。
 *
 * 背景: iOS ではロック画面から dismiss するとアプリが起動しない場合がある。
 * JS 側で1本ずつスケジュールする方式だとスヌーズが途切れるため、
 * アラーム設定時にまとめてスケジュールし、ネイティブ側で確実に発火させる。
 *
 * 呼び出し元: app/wakeup.tsx (アラーム dismiss 後のセッション開始時)
 * 対になる関数: cancelAllAlarms() (TODO全完了時に全アラームをキャンセル後、通常アラームを再スケジュール)
 *
 * @param baseTime スヌーズ起算時刻（通常はアラーム dismiss 時刻）
 * @param count スケジュールする本数（デフォルト SNOOZE_MAX_COUNT）
 * @param soundName AlarmKit に渡す音名（例: "chime.mp3"）。undefined でデフォルト音。
 * @returns スケジュールに成功したアラーム ID の配列
 */
export async function scheduleSnoozeAlarms(
  baseTime: Date,
  count: number = SNOOZE_MAX_COUNT,
  soundName?: string,
): Promise<readonly string[]> {
  const kit = getAlarmKit();
  if (kit === null) return [];

  const ids: string[] = [];
  for (let i = 1; i <= count; i++) {
    const id = kit.generateUUID();
    const snoozeDate = new Date(baseTime.getTime() + SNOOZE_DURATION_SECONDS * 1000 * i);
    const epochSeconds = Math.floor(snoozeDate.getTime() / 1000);

    try {
      const success = await kit.scheduleAlarm({
        id,
        epochSeconds,
        title: 'Good Morning',
        soundName,
        launchAppOnDismiss: true,
        dismissPayload: JSON.stringify({ isSnooze: true }),
      });
      if (success) ids.push(id);
    } catch {
      // 個別のスケジュール失敗はスキップして残りを続行
    }
  }
  return ids;
}

export async function cancelAllAlarms(): Promise<void> {
  const kit = getAlarmKit();
  if (kit === null) return;

  const existing = kit.getAllAlarms();
  const cancellations = existing.map((id) => kit.cancelAlarm(id));
  await Promise.all(cancellations);
}

/**
 * 指定された AlarmKit ID のアラームのみをキャンセルする。
 *
 * 背景: cancelAllAlarms() は全アラームを無差別にキャンセルするため、
 * スヌーズアラームとウェイクターゲットアラームを区別できなかった。
 * snoozeAlarmIds を永続化したことで、種別ごとの選択的キャンセルが可能になった。
 *
 * 用途:
 *   - completeMorningSession(): snoozeAlarmIds のみキャンセル
 *   - scheduleWakeTargetAlarm(): 前回の wake-target ID のみキャンセル
 */
export async function cancelAlarmsByIds(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const kit = getAlarmKit();
  if (kit === null) return;
  await Promise.all(ids.map((id) => kit.cancelAlarm(id)));
}
