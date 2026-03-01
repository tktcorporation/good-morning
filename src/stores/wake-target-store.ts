import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { DEFAULT_SOUND_ID } from '../constants/alarm-sounds';
import { syncWidget } from '../services/widget-sync';
import type { AlarmTime, DayOfWeek, TodoItem } from '../types/alarm';
import { createTodoId } from '../types/alarm';
import type { DayOverride, WakeTarget } from '../types/wake-target';
import {
  computeOverrideTargetDate,
  DEFAULT_WAKE_TARGET,
  DEFAULT_WAKE_UP_GOAL_BUFFER_MINUTES,
  isNextOverrideExpired,
} from '../types/wake-target';
import { migrateBedtimeToSleepMinutes } from '../utils/sleep';

const STORAGE_KEY = 'wake-target';
const ALARM_IDS_KEY = 'alarm-ids';

interface WakeTargetState {
  readonly target: WakeTarget | null;
  readonly loaded: boolean;
  readonly alarmIds: readonly string[];
  loadTarget: () => Promise<void>;
  setTarget: (target: WakeTarget) => Promise<void>;
  updateDefaultTime: (time: AlarmTime) => Promise<void>;
  setNextOverride: (time: AlarmTime) => Promise<void>;
  clearNextOverride: () => Promise<void>;
  setDayOverride: (day: DayOfWeek, override: DayOverride) => Promise<void>;
  removeDayOverride: (day: DayOfWeek) => Promise<void>;
  addTodo: (title: string) => Promise<void>;
  removeTodo: (id: string) => Promise<void>;
  reorderTodos: (todos: readonly TodoItem[]) => Promise<void>;
  setSoundId: (soundId: string) => Promise<void>;
  setTargetSleepMinutes: (minutes: number | null) => Promise<void>;
  setWakeUpGoalBufferMinutes: (minutes: number) => Promise<void>;
  toggleEnabled: () => Promise<void>;
  setAlarmIds: (ids: readonly string[]) => Promise<void>;
}

async function persist(target: WakeTarget): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(target));
}

/**
 * AsyncStorage のパース済みデータから WakeTarget を復元する。
 * レガシーフィールド（soundId 欠落、bedtimeTarget → targetSleepMinutes）のマイグレーションも行う。
 */
function migrateStoredTarget(parsed: Record<string, unknown>): WakeTarget {
  // targetSleepMinutes マイグレーション:
  // 1. 新フォーマット (targetSleepMinutes) があればそのまま使用
  // 2. 旧フォーマット (bedtimeTarget) があれば分数に変換
  // 3. どちらもなければ null（未設定）
  let targetSleepMinutes: number | null = null;
  if (typeof parsed.targetSleepMinutes === 'number') {
    targetSleepMinutes = parsed.targetSleepMinutes as number;
  } else if (parsed.bedtimeTarget !== undefined && parsed.bedtimeTarget !== null) {
    const bt = parsed.bedtimeTarget as { hour: number; minute: number };
    const dt = (parsed as unknown as WakeTarget).defaultTime;
    targetSleepMinutes = migrateBedtimeToSleepMinutes(bt, dt);
  }

  // wakeUpGoalBufferMinutes マイグレーション:
  // フィールドが存在しない旧データにはデフォルト値（30分）を適用
  const wakeUpGoalBufferMinutes =
    typeof parsed.wakeUpGoalBufferMinutes === 'number'
      ? (parsed.wakeUpGoalBufferMinutes as number)
      : DEFAULT_WAKE_UP_GOAL_BUFFER_MINUTES;

  return {
    ...(parsed as unknown as WakeTarget),
    soundId: typeof parsed.soundId === 'string' ? parsed.soundId : DEFAULT_SOUND_ID,
    targetSleepMinutes,
    wakeUpGoalBufferMinutes,
  };
}

export const useWakeTargetStore = create<WakeTargetState>((set, get) => ({
  target: null,
  loaded: false,
  alarmIds: [],

  loadTarget: async () => {
    const [raw, rawIds] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(ALARM_IDS_KEY),
    ]);
    const alarmIds: readonly string[] = rawIds !== null ? (JSON.parse(rawIds) as string[]) : [];
    if (raw !== null) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      let migrated = migrateStoredTarget(parsed);
      // 期限切れの nextOverride を自動クリア（レガシーデータの targetDate 欠落も含む）
      if (migrated.nextOverride !== null && isNextOverrideExpired(migrated.nextOverride)) {
        migrated = { ...migrated, nextOverride: null };
        await persist(migrated);
      }
      set({ target: migrated, loaded: true, alarmIds });
    } else {
      const fallback: WakeTarget = { ...DEFAULT_WAKE_TARGET, enabled: false };
      set({ target: fallback, loaded: true, alarmIds });
    }
  },

  setTarget: async (target: WakeTarget) => {
    set({ target });
    await persist(target);
    // ウィジェットに最新のアラーム情報を反映（fire-and-forget）
    syncWidget().catch(() => {});
  },

  updateDefaultTime: async (time: AlarmTime) => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = { ...target, defaultTime: time };
    set({ target: updated });
    await persist(updated);
    // ウィジェットに最新のアラーム情報を反映（fire-and-forget）
    syncWidget().catch(() => {});
  },

  setNextOverride: async (time: AlarmTime) => {
    const { target } = get();
    if (target === null) return;
    const targetDate = computeOverrideTargetDate(time);
    const updated: WakeTarget = { ...target, nextOverride: { time, targetDate } };
    set({ target: updated });
    await persist(updated);
    // ウィジェットに最新のアラーム情報を反映（fire-and-forget）
    syncWidget().catch(() => {});
  },

  clearNextOverride: async () => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = { ...target, nextOverride: null };
    set({ target: updated });
    await persist(updated);
    // ウィジェットに最新のアラーム情報を反映（fire-and-forget）
    syncWidget().catch(() => {});
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
    // ウィジェットに最新のアラーム情報を反映（fire-and-forget）
    syncWidget().catch(() => {});
  },

  removeDayOverride: async (day: DayOfWeek) => {
    const { target } = get();
    if (target === null) return;
    const { [day]: _, ...rest } = target.dayOverrides;
    const updated: WakeTarget = { ...target, dayOverrides: rest };
    set({ target: updated });
    await persist(updated);
    // ウィジェットに最新のアラーム情報を反映（fire-and-forget）
    syncWidget().catch(() => {});
  },

  addTodo: async (title: string) => {
    const { target } = get();
    if (target === null) return;
    const newTodo: TodoItem = { id: createTodoId(), title, completed: false };
    const updated: WakeTarget = { ...target, todos: [...target.todos, newTodo] };
    set({ target: updated });
    await persist(updated);
  },

  removeTodo: async (id: string) => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = {
      ...target,
      todos: target.todos.filter((t) => t.id !== id),
    };
    set({ target: updated });
    await persist(updated);
  },

  reorderTodos: async (todos: readonly TodoItem[]) => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = { ...target, todos };
    set({ target: updated });
    await persist(updated);
  },

  setSoundId: async (soundId: string) => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = { ...target, soundId };
    set({ target: updated });
    await persist(updated);
  },

  /**
   * 目標睡眠時間（分）を設定する。null を渡すとクリア。
   * Daily Grade System の夜の評価で使用される。
   * 就寝目標時刻は calculateBedtime() で算出。
   */
  setTargetSleepMinutes: async (minutes: number | null) => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = { ...target, targetSleepMinutes: minutes };
    set({ target: updated });
    await persist(updated);
  },

  /**
   * 起床目標バッファ（分）を設定する。
   * アラーム時刻 + この分数が起床目標時刻となり、
   * その時刻までに全TODO完了で morningPass 判定。
   */
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
    // ウィジェットに最新のアラーム情報を反映（fire-and-forget）
    syncWidget().catch(() => {});
  },

  setAlarmIds: async (ids: readonly string[]) => {
    set({ alarmIds: ids });
    await AsyncStorage.setItem(ALARM_IDS_KEY, JSON.stringify(ids));
  },
}));

export type { WakeTargetState };
