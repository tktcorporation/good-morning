import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { MorningSession, SessionTodo } from '../types/morning-session';

const STORAGE_KEY = 'morning-session';

interface MorningSessionState {
  readonly session: MorningSession | null;
  readonly loaded: boolean;
  /** スケジュール済みスヌーズの AlarmKit ID。キャンセル時に使用。メモリのみ（永続化しない）。 */
  readonly snoozeAlarmId: string | null;
  /** 次のスヌーズ発火予定時刻（ISO文字列）。ダッシュボードのカウントダウン表示に使用。メモリのみ。 */
  readonly snoozeFiresAt: string | null;
  /** アクティブな Live Activity の ID。更新・終了時に使用。メモリのみ。 */
  readonly liveActivityId: string | null;
  loadSession: () => Promise<void>;
  startSession: (recordId: string, date: string, todos: readonly SessionTodo[]) => Promise<void>;
  toggleTodo: (todoId: string) => Promise<void>;
  clearSession: () => Promise<void>;
  setSnoozeAlarmId: (id: string | null) => void;
  setSnoozeFiresAt: (time: string | null) => void;
  setLiveActivityId: (id: string | null) => void;
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
  snoozeAlarmId: null,
  snoozeFiresAt: null,
  liveActivityId: null,

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

  /** セッションと全てのエフェメラル状態（snooze, Live Activity）をクリアする。 */
  clearSession: async () => {
    set({ session: null, snoozeAlarmId: null, snoozeFiresAt: null, liveActivityId: null });
    await persistSession(null);
  },

  setSnoozeAlarmId: (id: string | null) => {
    set({ snoozeAlarmId: id });
  },

  setSnoozeFiresAt: (time: string | null) => {
    set({ snoozeFiresAt: time });
  },

  setLiveActivityId: (id: string | null) => {
    set({ liveActivityId: id });
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
