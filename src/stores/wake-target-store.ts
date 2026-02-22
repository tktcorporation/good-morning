import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { AlarmTime, DayOfWeek, TodoItem } from '../types/alarm';
import { createTodoId } from '../types/alarm';
import type { DayOverride, WakeTarget } from '../types/wake-target';

const STORAGE_KEY = 'wake-target';

interface WakeTargetState {
  readonly target: WakeTarget | null;
  readonly loaded: boolean;
  readonly notificationIds: readonly string[];
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
  toggleEnabled: () => Promise<void>;
  toggleTodoCompleted: (todoId: string) => void;
  resetTodos: () => void;
  areAllTodosCompleted: () => boolean;
}

async function persist(target: WakeTarget): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(target));
}

export const useWakeTargetStore = create<WakeTargetState>((set, get) => ({
  target: null,
  loaded: false,
  notificationIds: [],

  loadTarget: async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as WakeTarget;
      set({ target: parsed, loaded: true });
    } else {
      set({ loaded: true });
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
    const updated: WakeTarget = { ...target, nextOverride: { time } };
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
      todos: target.todos.map((t) =>
        t.id === todoId ? { ...t, completed: !t.completed } : t,
      ),
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
}));

export type { WakeTargetState };
