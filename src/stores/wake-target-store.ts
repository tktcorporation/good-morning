import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { DEFAULT_SOUND_ID } from '../constants/alarm-sounds';
import type { AlarmTime, DayOfWeek, TodoItem } from '../types/alarm';
import { createTodoId } from '../types/alarm';
import type { DayOverride, WakeTarget } from '../types/wake-target';
import {
  computeOverrideTargetDate,
  DEFAULT_WAKE_TARGET,
  isNextOverrideExpired,
} from '../types/wake-target';

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
  toggleEnabled: () => Promise<void>;
  toggleTodoCompleted: (todoId: string) => void;
  resetTodos: () => void;
  areAllTodosCompleted: () => boolean;
  setAlarmIds: (ids: readonly string[]) => Promise<void>;
}

async function persist(target: WakeTarget): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(target));
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
      let migrated: WakeTarget = {
        ...(parsed as unknown as WakeTarget),
        soundId: typeof parsed.soundId === 'string' ? parsed.soundId : DEFAULT_SOUND_ID,
      };
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
  },

  updateDefaultTime: async (time: AlarmTime) => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = { ...target, defaultTime: time };
    set({ target: updated });
    await persist(updated);
  },

  setNextOverride: async (time: AlarmTime) => {
    const { target } = get();
    if (target === null) return;
    const targetDate = computeOverrideTargetDate(time);
    const updated: WakeTarget = { ...target, nextOverride: { time, targetDate } };
    set({ target: updated });
    await persist(updated);
  },

  clearNextOverride: async () => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = { ...target, nextOverride: null };
    set({ target: updated });
    await persist(updated);
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
  },

  removeDayOverride: async (day: DayOfWeek) => {
    const { target } = get();
    if (target === null) return;
    const { [day]: _, ...rest } = target.dayOverrides;
    const updated: WakeTarget = { ...target, dayOverrides: rest };
    set({ target: updated });
    await persist(updated);
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

  toggleEnabled: async () => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = { ...target, enabled: !target.enabled };
    set({ target: updated });
    await persist(updated);
  },

  toggleTodoCompleted: (todoId: string) => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = {
      ...target,
      todos: target.todos.map((t) => (t.id === todoId ? { ...t, completed: !t.completed } : t)),
    };
    set({ target: updated });
  },

  resetTodos: () => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = {
      ...target,
      todos: target.todos.map((t) => ({ ...t, completed: false })),
    };
    set({ target: updated });
  },

  areAllTodosCompleted: (): boolean => {
    const { target } = get();
    if (target === null || target.todos.length === 0) return true;
    return target.todos.every((t) => t.completed);
  },

  setAlarmIds: async (ids: readonly string[]) => {
    set({ alarmIds: ids });
    await AsyncStorage.setItem(ALARM_IDS_KEY, JSON.stringify(ids));
  },
}));

export type { WakeTargetState };
