import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { cancelAlarmNotifications, scheduleAlarmNotifications } from '../services/notifications';
import type { Alarm, AlarmFormData, DayOfWeek, TodoItem } from '../types/alarm';
import { createAlarmId } from '../types/alarm';

const STORAGE_KEY = 'good-morning-alarms';

interface AlarmState {
  readonly alarms: readonly Alarm[];
  readonly loaded: boolean;
  readonly activeAlarmId: string | null;
  loadAlarms: () => Promise<void>;
  addAlarm: (data: AlarmFormData) => Promise<Alarm>;
  updateAlarm: (id: string, data: Partial<AlarmFormData>) => Promise<void>;
  deleteAlarm: (id: string) => Promise<void>;
  toggleAlarm: (id: string) => Promise<void>;
  setActiveAlarm: (id: string | null) => void;
  toggleTodo: (alarmId: string, todoId: string) => void;
  resetTodos: (alarmId: string) => void;
  areAllTodosCompleted: (alarmId: string) => boolean;
}

async function persistAlarms(alarms: readonly Alarm[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(alarms));
}

export const useAlarmStore = create<AlarmState>((set, get) => ({
  alarms: [],
  loaded: false,
  activeAlarmId: null,

  loadAlarms: async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed: readonly Alarm[] = JSON.parse(raw) as readonly Alarm[];
      set({ alarms: parsed, loaded: true });
    } else {
      set({ loaded: true });
    }
  },

  addAlarm: async (data: AlarmFormData): Promise<Alarm> => {
    const alarm: Alarm = {
      id: createAlarmId(),
      time: data.time,
      enabled: true,
      label: data.label,
      todos: data.todos,
      repeatDays: data.repeatDays,
      notificationIds: [],
    };

    const notificationIds = await scheduleAlarmNotifications(alarm);
    const alarmWithNotifications: Alarm = { ...alarm, notificationIds };

    const updated = [...get().alarms, alarmWithNotifications];
    set({ alarms: updated });
    await persistAlarms(updated);
    return alarmWithNotifications;
  },

  updateAlarm: async (id: string, data: Partial<AlarmFormData>): Promise<void> => {
    const { alarms } = get();
    const updated = alarms.map((alarm): Alarm => {
      if (alarm.id !== id) {
        return alarm;
      }
      return { ...alarm, ...data };
    });

    set({ alarms: updated });
    await persistAlarms(updated);

    const updatedAlarm = updated.find((a) => a.id === id);
    if (updatedAlarm?.enabled) {
      const notificationIds = await scheduleAlarmNotifications(updatedAlarm);
      const withNotifications = updated.map(
        (a): Alarm => (a.id === id ? { ...a, notificationIds } : a),
      );
      set({ alarms: withNotifications });
      await persistAlarms(withNotifications);
    }
  },

  deleteAlarm: async (id: string): Promise<void> => {
    const { alarms } = get();
    const alarm = alarms.find((a) => a.id === id);
    if (alarm) {
      await cancelAlarmNotifications(alarm.notificationIds);
    }
    const updated = alarms.filter((a) => a.id !== id);
    set({ alarms: updated });
    await persistAlarms(updated);
  },

  toggleAlarm: async (id: string): Promise<void> => {
    const { alarms } = get();
    const alarm = alarms.find((a) => a.id === id);
    if (!alarm) {
      return;
    }

    const toggled: Alarm = { ...alarm, enabled: !alarm.enabled };

    if (toggled.enabled) {
      const notificationIds = await scheduleAlarmNotifications(toggled);
      const updated = alarms.map((a): Alarm => (a.id === id ? { ...toggled, notificationIds } : a));
      set({ alarms: updated });
      await persistAlarms(updated);
    } else {
      await cancelAlarmNotifications(alarm.notificationIds);
      const updated = alarms.map(
        (a): Alarm => (a.id === id ? { ...toggled, notificationIds: [] } : a),
      );
      set({ alarms: updated });
      await persistAlarms(updated);
    }
  },

  setActiveAlarm: (id: string | null) => {
    set({ activeAlarmId: id });
  },

  toggleTodo: (alarmId: string, todoId: string) => {
    const { alarms } = get();
    const updated = alarms.map((alarm): Alarm => {
      if (alarm.id !== alarmId) {
        return alarm;
      }
      const updatedTodos = alarm.todos.map(
        (todo): TodoItem => (todo.id === todoId ? { ...todo, completed: !todo.completed } : todo),
      );
      return { ...alarm, todos: updatedTodos };
    });
    set({ alarms: updated });
  },

  resetTodos: (alarmId: string) => {
    const { alarms } = get();
    const updated = alarms.map((alarm): Alarm => {
      if (alarm.id !== alarmId) {
        return alarm;
      }
      const resetTodos = alarm.todos.map((todo): TodoItem => ({ ...todo, completed: false }));
      return { ...alarm, todos: resetTodos };
    });
    set({ alarms: updated });
  },

  areAllTodosCompleted: (alarmId: string): boolean => {
    const alarm = get().alarms.find((a) => a.id === alarmId);
    if (!alarm || alarm.todos.length === 0) {
      return true;
    }
    return alarm.todos.every((todo) => todo.completed);
  },
}));

export type { AlarmState, AlarmFormData, Alarm, TodoItem, DayOfWeek };
