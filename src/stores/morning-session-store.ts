import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { syncWidget } from '../services/widget-sync';
import type { MorningSession, SessionTodo } from '../types/morning-session';

const STORAGE_KEY = 'morning-session';

interface MorningSessionState {
  readonly session: MorningSession | null;
  readonly loaded: boolean;
  loadSession: () => Promise<void>;
  startSession: (
    recordId: string,
    date: string,
    todos: readonly SessionTodo[],
    goalDeadline: string | null,
  ) => Promise<void>;
  toggleTodo: (todoId: string) => Promise<void>;
  clearSession: () => Promise<void>;
  /**
   * snoozeAlarmIds と snoozeFiresAt をアトミックに更新し、session を AsyncStorage に永続化する。
   * 従来の setSnoozeAlarmIds + setSnoozeFiresAt を統合。session が null の場合は何もしない。
   */
  setSnoozeState: (ids: readonly string[], firesAt: string | null) => Promise<void>;
  /**
   * snoozeFiresAt のみを更新し、session を AsyncStorage に永続化する。
   * カウントダウン表示の更新用。session が null の場合は何もしない。
   */
  setSnoozeFiresAt: (time: string | null) => Promise<void>;
  /** liveActivityId を session 内に保存して AsyncStorage に永続化する。永続化完了を await できるため、アプリ kill 後も再起動時に endLiveActivity で回収可能。 */
  setLiveActivityId: (id: string | null) => Promise<void>;
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
      // マイグレーション: 後から追加されたフィールドが undefined になるレガシーデータに対応。
      // undefined のまま使うとクラッシュするため、デフォルト値にフォールバックする。
      set({
        session: {
          ...parsed,
          liveActivityId: parsed.liveActivityId ?? null,
          goalDeadline: parsed.goalDeadline ?? null,
          snoozeAlarmIds: parsed.snoozeAlarmIds ?? [],
          snoozeFiresAt: parsed.snoozeFiresAt ?? null,
        },
        loaded: true,
      });
    } else {
      set({ loaded: true });
    }
  },

  startSession: async (
    recordId: string,
    date: string,
    todos: readonly SessionTodo[],
    goalDeadline: string | null,
  ) => {
    const session: MorningSession = {
      recordId,
      date,
      startedAt: new Date().toISOString(),
      todos,
      liveActivityId: null,
      goalDeadline,
      snoozeAlarmIds: [],
      snoozeFiresAt: null,
    };
    set({ session });
    await persistSession(session);
    // ウィジェットにセッション開始を反映（fire-and-forget）
    syncWidget().catch(() => {});
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
    // ウィジェットに TODO 進捗を反映（fire-and-forget）
    syncWidget().catch(() => {});
  },

  /** セッションをクリアする。snooze state は session 内に含まれるため、session = null で自動的にクリアされる。 */
  clearSession: async () => {
    set({ session: null });
    await persistSession(null);
    // ウィジェットにセッション終了を反映（fire-and-forget）
    syncWidget().catch(() => {});
  },

  setSnoozeState: async (ids: readonly string[], firesAt: string | null) => {
    const { session } = get();
    if (session === null) return;
    const updated: MorningSession = {
      ...session,
      snoozeAlarmIds: ids,
      snoozeFiresAt: firesAt,
    };
    set({ session: updated });
    await persistSession(updated);
  },

  setSnoozeFiresAt: async (time: string | null) => {
    const { session } = get();
    if (session === null) return;
    const updated: MorningSession = { ...session, snoozeFiresAt: time };
    set({ session: updated });
    await persistSession(updated);
  },

  setLiveActivityId: async (id: string | null) => {
    const { session } = get();
    if (session === null) return;
    const updated: MorningSession = { ...session, liveActivityId: id };
    set({ session: updated });
    // 永続化を await して、アプリ kill 後も再起動時に endLiveActivity で回収できるようにする。
    // 呼び出し元が await することで「persist 完了後に次の処理」が保証される。
    await persistSession(updated);
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
