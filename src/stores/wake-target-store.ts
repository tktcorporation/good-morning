import { Effect } from 'effect';
import { create } from 'zustand';
import { STORAGE_KEYS } from '../constants/storage-keys';
import { runEffect, runEffectFork, Storage, syncAlarmsEffect, syncWidgetEffect } from '../services';
import type { StorageError } from '../services/errors';
import type { AlarmTime, DayOfWeek } from '../types/alarm';
import type { DayOverride, NextOverride, WakeTarget } from '../types/wake-target';
import {
  buildFixedSquatTodo,
  DEFAULT_WAKE_TARGET,
  DEFAULT_WAKE_UP_GOAL_BUFFER_MINUTES,
  isFixedSquatTodoList,
  isNextOverrideExpired,
  resolveOverrideSaveDate,
} from '../types/wake-target';
import { migrateBedtimeToSleepMinutes } from '../utils/sleep';

const STORAGE_KEY = STORAGE_KEYS.wakeTarget;
const ALARM_IDS_KEY = STORAGE_KEYS.alarmIds;

interface WakeTargetState {
  readonly target: WakeTarget | null;
  readonly loaded: boolean;
  /**
   * 永続化データがパース不能で target を確定できない状態。
   * loaded は true にしてダッシュボードをローディング表示から解放しつつ、
   * このフラグで「編集不可・要リセット」を伝える。syncAlarmsEffect は
   * corrupted 中は同期をスキップし、実在するネイティブアラームを
   * 誤ってキャンセルしない。
   */
  readonly corrupted: boolean;
  readonly alarmIds: readonly string[];
  loadTarget: () => Promise<void>;
  /** corrupted 状態を解除し、無効化した DEFAULT_WAKE_TARGET で復旧する。 */
  resetCorruptedTarget: () => Promise<void>;
  setTarget: (target: WakeTarget) => Promise<void>;
  updateDefaultTime: (time: AlarmTime) => Promise<void>;
  /**
   * editDay は target-edit のピッカーが確定した対象日（resolveOverrideEditDay）。
   * ここで now から独立して対象日を再計算すると、ユーザーがピッカーの初期値
   * から時刻を変更した場合に、表示されていた対象日とズレることがある。
   */
  setNextOverride: (time: AlarmTime, editDay: Date) => Promise<void>;
  clearNextOverride: () => Promise<void>;
  /**
   * 期限切れの nextOverride のみをクリアする。
   * 通常起動時に呼び出す（アラーム起動時はクリアしない）。
   */
  clearExpiredOverride: () => Promise<void>;
  setDayOverride: (day: DayOfWeek, override: DayOverride) => Promise<void>;
  removeDayOverride: (day: DayOfWeek) => Promise<void>;
  setTargetSleepMinutes: (minutes: number | null) => Promise<void>;
  setWakeUpGoalBufferMinutes: (minutes: number) => Promise<void>;
  toggleEnabled: () => Promise<void>;
  setAlarmIds: (ids: readonly string[]) => Promise<void>;
}

function persist(target: WakeTarget): Promise<void> {
  return runEffect(
    Storage.pipe(Effect.flatMap((storage) => storage.set(STORAGE_KEY, JSON.stringify(target)))),
  );
}

/** target と alarmIds を並行して読み取る。Storage.get はリトライ付き。 */
function readStoredEffect(): Effect.Effect<
  { raw: string | null; rawIds: string | null },
  StorageError,
  Storage
> {
  return Storage.pipe(
    Effect.flatMap((storage) =>
      Effect.all(
        { raw: storage.get(STORAGE_KEY), rawIds: storage.get(ALARM_IDS_KEY) },
        { concurrency: 'unbounded' },
      ),
    ),
  );
}

/**
 * target 変更時にウィジェットとアラームを同期する。
 * Effect ランタイムで実行し、エラーは console.error に出力される
 * （従来の `.catch(() => {})` よりエラーが見える）。
 */
function syncAfterTargetChange(): void {
  runEffectFork(syncWidgetEffect);
  runEffectFork(syncAlarmsEffect);
}

/**
 * AlarmTime として妥当な形状か（時・分が範囲内の整数か）を判定する。
 * 不正な時刻がネイティブの scheduleRepeatingAlarm に渡ると鳴らないアラームが
 * 静かに登録されるため、境界でパースして弾く。
 */
function parseAlarmTime(raw: unknown): AlarmTime | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as { hour?: unknown; minute?: unknown };
  if (
    typeof t.hour === 'number' &&
    Number.isInteger(t.hour) &&
    t.hour >= 0 &&
    t.hour <= 23 &&
    typeof t.minute === 'number' &&
    Number.isInteger(t.minute) &&
    t.minute >= 0 &&
    t.minute <= 59
  ) {
    return { hour: t.hour, minute: t.minute };
  }
  return null;
}

/** 妥当なエントリのみ残して dayOverrides を復元する。欠落・破損は空扱い。 */
function parseDayOverrides(raw: unknown): WakeTarget['dayOverrides'] {
  if (typeof raw !== 'object' || raw === null) return {};
  const result: Partial<Record<DayOfWeek, DayOverride>> = {};
  for (let d = 0; d < 7; d++) {
    const day = d as DayOfWeek;
    const entry = (raw as Record<number, unknown>)[day];
    if (typeof entry !== 'object' || entry === null) continue;
    const type = (entry as { type?: unknown }).type;
    if (type === 'off') {
      result[day] = { type: 'off' };
    } else if (type === 'custom') {
      const time = parseAlarmTime((entry as { time?: unknown }).time);
      if (time !== null) result[day] = { type: 'custom', time };
    }
  }
  return result;
}

/** 妥当な time と targetDate を持つ場合のみ nextOverride を復元する。破損は null 扱い。 */
function parseNextOverride(raw: unknown): NextOverride | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const time = parseAlarmTime((raw as { time?: unknown }).time);
  if (time === null) return null;
  const targetDate = (raw as { targetDate?: unknown }).targetDate;
  return { time, targetDate: typeof targetDate === 'string' ? targetDate : '' };
}

/**
 * AsyncStorage のパース済みデータから WakeTarget を復元する。
 * レガシーフィールド（bedtimeTarget → targetSleepMinutes）のマイグレーションも行う。
 *
 * 各フィールドを個別にパース・正規化して明示的に組み立てる。生 JSON を
 * 型キャストで素通しすると、フィールドが欠落したレガシーデータで
 * スケジューリングが TypeError で例外死し、旧アラームのキャンセルだけが
 * 実行されて「アラームが 1 本も無い」状態に陥る。
 */
function migrateStoredTarget(parsed: Record<string, unknown>): WakeTarget {
  const defaultTime = parseAlarmTime(parsed.defaultTime) ?? DEFAULT_WAKE_TARGET.defaultTime;

  let targetSleepMinutes: number | null = null;
  if (typeof parsed.targetSleepMinutes === 'number') {
    targetSleepMinutes = parsed.targetSleepMinutes;
  } else if (parsed.bedtimeTarget !== undefined && parsed.bedtimeTarget !== null) {
    const bt = parseAlarmTime(parsed.bedtimeTarget);
    if (bt !== null) {
      targetSleepMinutes = migrateBedtimeToSleepMinutes(bt, defaultTime);
    }
  }

  const wakeUpGoalBufferMinutes =
    typeof parsed.wakeUpGoalBufferMinutes === 'number'
      ? parsed.wakeUpGoalBufferMinutes
      : DEFAULT_WAKE_UP_GOAL_BUFFER_MINUTES;

  // 起床タスクは「スクワット 10 回」固定に統一する設計のため、
  // 永続化済みデータのうち固定 TODO 1 件以外を含むものは次回ロード時に正規化する。
  // 自由入力タスクの履歴は破棄される（仕様の単純化を優先）。
  const storedTodos = Array.isArray(parsed.todos) ? (parsed.todos as WakeTarget['todos']) : [];
  const todos = isFixedSquatTodoList(storedTodos) ? storedTodos : [buildFixedSquatTodo()];

  return {
    defaultTime,
    dayOverrides: parseDayOverrides(parsed.dayOverrides),
    nextOverride: parseNextOverride(parsed.nextOverride),
    todos,
    // enabled 欠落は true に倒す: 保存済みデータが存在する = 利用中のユーザーで、
    // 誤って false に倒すと翌朝のアラームが黙って消える方が被害が大きい
    enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
    targetSleepMinutes,
    wakeUpGoalBufferMinutes,
  };
}

/** 永続化済み alarm-ids のパース。破損は空扱い（孤立アラームは orphan cancel が回収する）。 */
function parseStoredAlarmIds(raw: string | null): readonly string[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

/** 永続化済み target のパース。破損は「未設定」として null を返す。 */
function parseStoredTarget(raw: string | null): WakeTarget | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return migrateStoredTarget(parsed as Record<string, unknown>);
  } catch {
    return null;
  }
}

export const useWakeTargetStore = create<WakeTargetState>((set, get) => ({
  target: null,
  loaded: false,
  corrupted: false,
  alarmIds: [],

  loadTarget: async () => {
    // 読み取り自体の失敗（StorageError、リトライしても解決しない）は target/alarmIds
    // どちらの実データも確認できていない。loaded=false のまま留めて再試行（アプリ
    // 再起動等）に委ねる — 他ストアと同じ方針。パース失敗（データは読めたが壊れている）は
    // parseStoredAlarmIds/parseStoredTarget が内部で吸収し、ロード全体を失敗させない:
    // loadTarget が失敗すると loaded=false のまま syncAlarmsEffect が永久にスキップされ、
    // アラーム同期が復旧不能になる
    let raw: string | null;
    let rawIds: string | null;
    try {
      ({ raw, rawIds } = await runEffect(readStoredEffect()));
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole: 起動時初期化の失敗を握り潰さず可視化する
      console.error('[wake-target-store] loadTarget failed after retries', error);
      return;
    }

    const alarmIds = parseStoredAlarmIds(rawIds);
    const migrated = parseStoredTarget(raw);

    if (migrated !== null) {
      set({ target: migrated, loaded: true, corrupted: false, alarmIds });
    } else if (raw === null) {
      // 未設定（初回起動・オンボーディング未完了）→ OFF が正しい初期値
      set({
        target: { ...DEFAULT_WAKE_TARGET, enabled: false },
        loaded: true,
        corrupted: false,
        alarmIds,
      });
    } else {
      // raw はあったがパースに失敗（一時的なストレージ破損）。target を
      // 確定できないため null のまま維持し、syncAlarmsEffect 側の corrupted
      // ガードで同期をスキップさせる。捏造した DEFAULT_WAKE_TARGET
      // （7:00・enabled:true）で同期させると、alarmIds（実在するネイティブ
      // アラーム ID）を previousIds として使い新規スケジュールした上で、
      // ユーザーの実際の設定に基づく旧アラームをキャンセルしてしまう。
      // loaded は true にする — false のままだとダッシュボードがローディング
      // 画面に固まり続け、resetCorruptedTarget による復旧導線にも到達できない
      set({ loaded: true, corrupted: true, alarmIds });
    }
  },

  resetCorruptedTarget: async () => {
    const target: WakeTarget = { ...DEFAULT_WAKE_TARGET, enabled: false };
    set({ target, corrupted: false });
    await persist(target);
    syncAfterTargetChange();
  },

  setTarget: async (target: WakeTarget) => {
    set({ target });
    await persist(target);
    syncAfterTargetChange();
  },

  updateDefaultTime: async (time: AlarmTime) => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = { ...target, defaultTime: time };
    set({ target: updated });
    await persist(updated);
    syncAfterTargetChange();
  },

  setNextOverride: async (time: AlarmTime, editDay: Date) => {
    const { target } = get();
    if (target === null) return;
    const targetDate = resolveOverrideSaveDate(editDay, time);
    const updated: WakeTarget = { ...target, nextOverride: { time, targetDate } };
    set({ target: updated });
    await persist(updated);
    syncAfterTargetChange();
  },

  clearNextOverride: async () => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = { ...target, nextOverride: null };
    set({ target: updated });
    await persist(updated);
    syncAfterTargetChange();
  },

  clearExpiredOverride: async () => {
    const { target } = get();
    if (target === null || target.nextOverride === null) return;
    if (!isNextOverrideExpired(target.nextOverride)) return;
    const updated: WakeTarget = { ...target, nextOverride: null };
    set({ target: updated });
    await persist(updated);
    syncAfterTargetChange();
  },

  setDayOverride: async (day: DayOfWeek, override: DayOverride) => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = {
      ...target,
      dayOverrides: { ...target.dayOverrides, [day]: override },
    };
    set({ target: updated });
    await persist(updated);
    syncAfterTargetChange();
  },

  removeDayOverride: async (day: DayOfWeek) => {
    const { target } = get();
    if (target === null) return;
    const { [day]: _, ...rest } = target.dayOverrides;
    const updated: WakeTarget = { ...target, dayOverrides: rest };
    set({ target: updated });
    await persist(updated);
    syncAfterTargetChange();
  },

  setTargetSleepMinutes: async (minutes: number | null) => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = { ...target, targetSleepMinutes: minutes };
    set({ target: updated });
    await persist(updated);
  },

  setWakeUpGoalBufferMinutes: async (minutes: number) => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = { ...target, wakeUpGoalBufferMinutes: minutes };
    set({ target: updated });
    await persist(updated);
  },

  toggleEnabled: async () => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = { ...target, enabled: !target.enabled };
    set({ target: updated });
    await persist(updated);
    syncAfterTargetChange();
  },

  setAlarmIds: async (ids: readonly string[]) => {
    set({ alarmIds: ids });
    await runEffect(
      Storage.pipe(Effect.flatMap((storage) => storage.set(ALARM_IDS_KEY, JSON.stringify(ids)))),
    );
  },
}));
