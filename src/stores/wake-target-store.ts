import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { runEffectFork, syncAlarmsEffect, syncWidgetEffect } from '../services';
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
  /**
   * 期限切れの nextOverride のみをクリアする。
   * 通常起動時に呼び出す（アラーム起動時はクリアしない）。
   */
  clearExpiredOverride: () => Promise<void>;
  setDayOverride: (day: DayOfWeek, override: DayOverride) => Promise<void>;
  removeDayOverride: (day: DayOfWeek) => Promise<void>;
  addTodo: (title: string) => Promise<void>;
  /** スクワットチャレンジタスクを追加する。requiredCount はデフォルト10回。 */
  addSquatTodo: (title: string, requiredCount?: number) => Promise<void>;
  removeTodo: (id: string) => Promise<void>;
  reorderTodos: (todos: readonly TodoItem[]) => Promise<void>;
  setTargetSleepMinutes: (minutes: number | null) => Promise<void>;
  setWakeUpGoalBufferMinutes: (minutes: number) => Promise<void>;
  toggleEnabled: () => Promise<void>;
  setAlarmIds: (ids: readonly string[]) => Promise<void>;
}

async function persist(target: WakeTarget): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(target));
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
 * AsyncStorage のパース済みデータから WakeTarget を復元する。
 * レガシーフィールド（bedtimeTarget → targetSleepMinutes）のマイグレーションも行う。
 */
function migrateStoredTarget(parsed: Record<string, unknown>): WakeTarget {
  let targetSleepMinutes: number | null = null;
  if (typeof parsed.targetSleepMinutes === 'number') {
    targetSleepMinutes = parsed.targetSleepMinutes as number;
  } else if (parsed.bedtimeTarget !== undefined && parsed.bedtimeTarget !== null) {
    const bt = parsed.bedtimeTarget as { hour: number; minute: number };
    const dt = (parsed as unknown as WakeTarget).defaultTime;
    targetSleepMinutes = migrateBedtimeToSleepMinutes(bt, dt);
  }

  const wakeUpGoalBufferMinutes =
    typeof parsed.wakeUpGoalBufferMinutes === 'number'
      ? (parsed.wakeUpGoalBufferMinutes as number)
      : DEFAULT_WAKE_UP_GOAL_BUFFER_MINUTES;

  return {
    ...(parsed as unknown as WakeTarget),
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
      const migrated = migrateStoredTarget(parsed);
      set({ target: migrated, loaded: true, alarmIds });
    } else {
      const fallback: WakeTarget = { ...DEFAULT_WAKE_TARGET, enabled: false };
      set({ target: fallback, loaded: true, alarmIds });
    }
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

  setNextOverride: async (time: AlarmTime) => {
    const { target } = get();
    if (target === null) return;
    const targetDate = computeOverrideTargetDate(time);
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

  addTodo: async (title: string) => {
    const { target } = get();
    if (target === null) return;
    const newTodo: TodoItem = { id: createTodoId(), title, completed: false };
    const updated: WakeTarget = { ...target, todos: [...target.todos, newTodo] };
    set({ target: updated });
    await persist(updated);
  },

  addSquatTodo: async (title: string, requiredCount = 10) => {
    const { target } = get();
    if (target === null) return;
    const newTodo: TodoItem = {
      id: createTodoId(),
      title,
      completed: false,
      type: 'squat',
      requiredCount,
    };
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
    await AsyncStorage.setItem(ALARM_IDS_KEY, JSON.stringify(ids));
  },
}));
