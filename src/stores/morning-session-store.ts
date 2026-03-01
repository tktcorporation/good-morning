import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { syncWidget } from '../services/widget-sync';
import type { MorningSession, SessionTodo } from '../types/morning-session';

const STORAGE_KEY = 'morning-session';

interface MorningSessionState {
  readonly session: MorningSession | null;
  readonly loaded: boolean;
  /** 先行スケジュール済みスヌーズの AlarmKit ID 配列。TODO全完了時に残りを一括キャンセルする。メモリのみ（永続化しない）。 */
  readonly snoozeAlarmIds: readonly string[];
  /** 次のスヌーズ発火予定時刻（ISO文字列）。ダッシュボードのカウントダウン表示に使用。メモリのみ。 */
  readonly snoozeFiresAt: string | null;
  loadSession: () => Promise<void>;
  startSession: (
    recordId: string,
    date: string,
    todos: readonly SessionTodo[],
    goalDeadline: string | null,
  ) => Promise<void>;
  toggleTodo: (todoId: string) => Promise<void>;
  clearSession: () => Promise<void>;
  setSnoozeAlarmIds: (ids: readonly string[]) => void;
  setSnoozeFiresAt: (time: string | null) => void;
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
  snoozeAlarmIds: [],
  snoozeFiresAt: null,

  loadSession: async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as MorningSession;
      // マイグレーション: liveActivityId / goalDeadline が追加される前の既存データでは
      // フィールドが undefined になる。undefined のまま使うとクラッシュするため null にフォールバック。
      set({
        session: {
          ...parsed,
          liveActivityId: parsed.liveActivityId ?? null,
          goalDeadline: parsed.goalDeadline ?? null,
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

  /** セッションと全てのエフェメラル状態（snooze）をクリアする。liveActivityId は session 内に含まれるため自動的にクリアされる。 */
  clearSession: async () => {
    set({ session: null, snoozeAlarmIds: [], snoozeFiresAt: null });
    await persistSession(null);
    // ウィジェットにセッション終了を反映（fire-and-forget）
    syncWidget().catch(() => {});
  },

  setSnoozeAlarmIds: (ids: readonly string[]) => {
    set({ snoozeAlarmIds: ids });
  },

  setSnoozeFiresAt: (time: string | null) => {
    set({ snoozeFiresAt: time });
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
