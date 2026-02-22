import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { MorningSession, SessionTodo } from '../types/morning-session';

const STORAGE_KEY = 'morning-session';

interface MorningSessionState {
  readonly session: MorningSession | null;
  readonly loaded: boolean;
  loadSession: () => Promise<void>;
  startSession: (recordId: string, date: string, todos: readonly SessionTodo[]) => Promise<void>;
  toggleTodo: (todoId: string) => Promise<void>;
  clearSession: () => Promise<void>;
  isActive: () => boolean;
  areAllCompleted: () => boolean;
  getProgress: () => { completed: number; total: number };
}

async function persistSession(session: MorningSession | null): Promise<void> {
  if (session === null) {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } else {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }
}

export const useMorningSessionStore = create<MorningSessionState>((set, get) => ({
  session: null,
  loaded: false,

  loadSession: async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as MorningSession;
      set({ session: parsed, loaded: true });
    } else {
      set({ loaded: true });
    }
  },

  startSession: async (recordId: string, date: string, todos: readonly SessionTodo[]) => {
    const session: MorningSession = {
      recordId,
      date,
      startedAt: new Date().toISOString(),
      todos,
    };
    set({ session });
    await persistSession(session);
  },

  toggleTodo: async (todoId: string) => {
    const { session } = get();
    if (session === null) return;

    const updated: MorningSession = {
      ...session,
      todos: session.todos.map((t) => {
        if (t.id !== todoId) return t;
        const nowCompleted = !t.completed;
        return {
          ...t,
          completed: nowCompleted,
          completedAt: nowCompleted ? new Date().toISOString() : null,
        };
      }),
    };
    set({ session: updated });
    await persistSession(updated);
  },

  clearSession: async () => {
    set({ session: null });
    await persistSession(null);
  },

  isActive: () => get().session !== null,

  areAllCompleted: () => {
    const { session } = get();
    if (session === null || session.todos.length === 0) return false;
    return session.todos.every((t) => t.completed);
  },

  getProgress: () => {
    const { session } = get();
    if (session === null) return { completed: 0, total: 0 };
    const completed = session.todos.filter((t) => t.completed).length;
    return { completed, total: session.todos.length };
  },
}));

export type { MorningSessionState };
