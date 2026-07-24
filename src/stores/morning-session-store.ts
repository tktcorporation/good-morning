import { Effect, Either, Schema } from 'effect';
import { create } from 'zustand';
import { STORAGE_KEYS } from '../constants/storage-keys';
import {
  asRecord,
  decodeFieldOrDefault,
  decodeOptionalField,
  decodeStoredJson,
  runEffect,
  runEffectFork,
  Storage,
  syncWidgetEffect,
  TodoTypeSchema,
} from '../services';
import type { StorageError } from '../services/errors';
import type { MorningSession, SessionTodo, StoredMorningSession } from '../types/morning-session';
import { normalizeStoredSession } from '../types/morning-session';
import type { WakeTaskType } from '../types/wake-target';
import { buildFixedTodoForTaskType } from '../types/wake-target';
import { logError } from '../utils/logger';

/** taskType の固定 TODO テンプレート（TodoItem）を、未着手の SessionTodo に変換する。 */
function buildInitialSessionTodo(taskType: WakeTaskType): SessionTodo {
  const todo = buildFixedTodoForTaskType(taskType);
  return {
    id: todo.id,
    title: todo.title,
    completed: false,
    completedAt: null,
    type: todo.type,
    requiredCount: todo.requiredCount,
    currentCount: 0,
  };
}

const STORAGE_KEY = STORAGE_KEYS.morningSession;

/**
 * 永続化済み SessionTodo を要素単位で寛容にデコードする。id/title はタスクを
 * 識別・表示するための最小限のフィールドのため欠落・型不一致なら null を返し、
 * 呼び出し元がその要素だけを読み飛ばす。
 */
function decodeSessionTodo(raw: unknown): SessionTodo | null {
  const obj = asRecord(raw);
  const idResult = Schema.decodeUnknownEither(Schema.String)(obj.id);
  const titleResult = Schema.decodeUnknownEither(Schema.String)(obj.title);
  if (Either.isLeft(idResult) || Either.isLeft(titleResult)) return null;

  return {
    id: idResult.right,
    title: titleResult.right,
    completed: decodeFieldOrDefault(Schema.Boolean, obj.completed, false),
    completedAt: decodeFieldOrDefault(Schema.NullOr(Schema.String), obj.completedAt, null),
    type: decodeOptionalField(TodoTypeSchema, obj.type),
    requiredCount: decodeOptionalField(Schema.Number, obj.requiredCount),
    currentCount: decodeOptionalField(Schema.Number, obj.currentCount),
  };
}

/**
 * 永続化済み MorningSession をフィールド単位で寛容にデコードする。date/startedAt は
 * セッションを識別・成立させるための最小限のフィールドのため欠落・型不一致・
 * （startedAt の場合）ISO パース不能なら null を返してセッションごと破棄する。
 * Schema.Struct の一括デコードだと1フィールド・1タスクの不整合が recordId や
 * snooze 状態まで巻き添えで失わせてしまうため、フィールドごとに独立してデコードする。
 * startedAt のパース可否をここで検証することで、normalizeStoredSession の windowEnd
 * フォールバック計算（`new Date(startedAt).toISOString()`）が RangeError を投げて
 * StorageDecodeError の捕捉から漏れる事態も防ぐ。
 */
function decodeStoredMorningSession(parsed: unknown): StoredMorningSession | null {
  const obj = asRecord(parsed);
  const dateResult = Schema.decodeUnknownEither(Schema.String)(obj.date);
  const startedAtResult = Schema.decodeUnknownEither(Schema.String)(obj.startedAt);
  if (Either.isLeft(dateResult) || Either.isLeft(startedAtResult)) return null;
  if (Number.isNaN(new Date(startedAtResult.right).getTime())) return null;

  const todosRaw = Array.isArray(obj.todos) ? obj.todos : [];
  const todos: SessionTodo[] = [];
  for (const t of todosRaw) {
    const todo = decodeSessionTodo(t);
    if (todo !== null) todos.push(todo);
  }

  return {
    recordId: decodeOptionalField(Schema.NullOr(Schema.String), obj.recordId),
    date: dateResult.right,
    startedAt: startedAtResult.right,
    todos,
    windowEnd: decodeOptionalField(Schema.String, obj.windowEnd),
    liveActivityId: decodeOptionalField(Schema.NullOr(Schema.String), obj.liveActivityId),
    goalDeadline: decodeOptionalField(Schema.NullOr(Schema.String), obj.goalDeadline),
    snoozeAlarmIds: decodeOptionalField(Schema.Array(Schema.String), obj.snoozeAlarmIds),
    snoozeFiresAt: decodeOptionalField(Schema.NullOr(Schema.String), obj.snoozeFiresAt),
  };
}

interface MorningSessionState {
  readonly session: MorningSession | null;
  readonly loaded: boolean;
  loadSession: () => Promise<void>;
  /**
   * セッションを開始する。
   *
   * 設計変更: recordId はセッション開始時には不要（自動開始時は WakeRecord 未作成）。
   * アラーム dismiss 時に setRecordId で後から紐づける。
   */
  startSession: (
    date: string,
    todos: readonly SessionTodo[],
    goalDeadline: string | null,
    windowEnd: string,
  ) => Promise<void>;
  /**
   * WakeRecord ID をセッションに紐づける。
   * アラーム dismiss 時に呼ばれる。セッションが自動開始済みの場合に使用。
   */
  setRecordId: (recordId: string) => Promise<void>;
  /**
   * goalDeadline を後から設定する。
   * セッション自動開始時は null で、アラーム dismiss 時に算出して設定。
   */
  setGoalDeadline: (deadline: string | null) => Promise<void>;
  toggleTodo: (todoId: string) => Promise<void>;
  /**
   * squat タスクのカウントを1つ進める。requiredCount に達したら自動で completed にする。
   * checkbox タスクに対して呼ばれた場合は何もしない。
   */
  incrementTodoCount: (todoId: string) => Promise<void>;
  /**
   * sky タスクをネイティブ画像分類の判定成功時にのみ完了させる。
   * toggleTodo と異なりタップだけでは完了できない — squat の加速度センサー判定と同様、
   * 寝ぼけたままの操作だけで完了できる抜け道を作らないため、呼び出し元
   * （SkyChallengeItem）は判定成功時にのみこれを呼ぶ。sky 以外のタスクや、
   * 既に completed なタスクに対して呼ばれた場合は何もしない。
   */
  completeSkyTodo: (todoId: string) => Promise<void>;
  /**
   * 進行中セッションの起床タスクを別の種別（squat/sky）に丸ごと切り替える。
   * WakeTarget.todos と同じ「taskType に対応する固定 TODO 1 件のみ」という
   * 不変条件をセッション側でも保つため、既存の進捗（completed/currentCount）は
   * 引き継がず、新しい taskType の未着手状態から始める。session が null の場合、
   * および全タスク完了済みの場合（完了済みを未完了に戻すと onAllTodosCompletedEffect
   * の再発火で確定済み WakeRecord が上書きされるため）は何もしない。
   */
  switchTaskType: (taskType: WakeTaskType) => Promise<void>;
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
  /** セッションの windowEnd を過ぎているかどうか。期限切れセッションのクリーンアップに使用。 */
  isExpired: () => boolean;
  areAllCompleted: () => boolean;
  getProgress: () => { completed: number; total: number };
}

function persistSession(session: MorningSession | null): Promise<void> {
  return runEffect(
    Storage.pipe(
      Effect.flatMap((storage) =>
        session === null
          ? storage.remove(STORAGE_KEY)
          : storage.set(STORAGE_KEY, JSON.stringify(session)),
      ),
    ),
  );
}

/**
 * session を読み取ってデコードする Effect。
 * 読み取り自体の失敗（StorageError）はそのまま呼び出し元に伝播させ、データ破損
 * （スキーマ不一致・JSON パース失敗）は未設定（null）扱いにする。デコード成功後は
 * normalizeStoredSession で「後から追加されたフィールドが欠落するレガシーデータ」を
 * 既定値で補って正規化する。
 */
function loadSessionEffect(): Effect.Effect<MorningSession | null, StorageError, Storage> {
  return Storage.pipe(
    Effect.flatMap((storage) => storage.get(STORAGE_KEY)),
    Effect.flatMap((raw) => decodeStoredJson(STORAGE_KEY, Schema.Unknown, raw)),
    Effect.map((decoded) => {
      if (decoded === null) return null;
      const stored = decodeStoredMorningSession(decoded);
      return stored === null ? null : normalizeStoredSession(stored);
    }),
    Effect.catchTag('StorageDecodeError', () => Effect.succeed(null)),
  );
}

export const useMorningSessionStore = create<MorningSessionState>((set, get) => ({
  session: null,
  loaded: false,

  loadSession: async () => {
    // パース失敗（データは読めたが壊れている）は未設定扱いで確定してよいが、
    // 読み取り自体の失敗（リトライしても解決しない）はストレージ上に永続化済みの
    // 進行中セッションの有無が確認できていない。loaded=true・session=null にすると、
    // syncAlarmsEffect が生存中のスヌーズを孤立とみなしてキャンセルしたり、
    // 自動開始/dismiss 処理が新規セッションを永続化済みセッションの上に
    // 上書きしてしまうため、loaded=false のまま留めて以降の再試行
    // （アプリ再起動等）に委ねる
    try {
      const session = await runEffect(loadSessionEffect());
      set({ session, loaded: true });
    } catch (error) {
      logError('morning-session-store', 'loadSession failed after retries', error);
    }
  },

  startSession: async (
    date: string,
    todos: readonly SessionTodo[],
    goalDeadline: string | null,
    windowEnd: string,
  ) => {
    const session: MorningSession = {
      recordId: null,
      date,
      startedAt: new Date().toISOString(),
      todos,
      windowEnd,
      liveActivityId: null,
      goalDeadline,
      snoozeAlarmIds: [],
      snoozeFiresAt: null,
    };
    set({ session });
    await persistSession(session);
    // ウィジェットにセッション開始を反映（fire-and-forget）
    runEffectFork(syncWidgetEffect);
  },

  setRecordId: async (recordId: string) => {
    const { session } = get();
    if (session === null) return;
    const updated: MorningSession = { ...session, recordId };
    set({ session: updated });
    await persistSession(updated);
  },

  setGoalDeadline: async (deadline: string | null) => {
    const { session } = get();
    if (session === null) return;
    const updated: MorningSession = { ...session, goalDeadline: deadline };
    set({ session: updated });
    await persistSession(updated);
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
    runEffectFork(syncWidgetEffect);
  },

  incrementTodoCount: async (todoId: string) => {
    const { session } = get();
    if (session === null) return;

    const todo = session.todos.find((t) => t.id === todoId);
    if (todo === undefined || (todo.type ?? 'checkbox') === 'checkbox') return;
    if (todo.completed) return;

    const newCount = (todo.currentCount ?? 0) + 1;
    const required = todo.requiredCount ?? 10;
    const nowCompleted = newCount >= required;

    const updated: MorningSession = {
      ...session,
      todos: session.todos.map((t) => {
        if (t.id !== todoId) return t;
        return {
          ...t,
          currentCount: newCount,
          completed: nowCompleted,
          completedAt: nowCompleted ? new Date().toISOString() : null,
        };
      }),
    };
    set({ session: updated });
    await persistSession(updated);
    runEffectFork(syncWidgetEffect);
  },

  completeSkyTodo: async (todoId: string) => {
    const { session } = get();
    if (session === null) return;

    const todo = session.todos.find((t) => t.id === todoId);
    if (todo === undefined || todo.type !== 'sky') return;
    if (todo.completed) return;

    const updated: MorningSession = {
      ...session,
      todos: session.todos.map((t) =>
        t.id === todoId ? { ...t, completed: true, completedAt: new Date().toISOString() } : t,
      ),
    };
    set({ session: updated });
    await persistSession(updated);
    runEffectFork(syncWidgetEffect);
  },

  switchTaskType: async (taskType: WakeTaskType) => {
    const { session, areAllCompleted } = get();
    if (session === null) return;
    // 全完了済みセッションを未完了に戻すと、onAllTodosCompletedEffect の
    // useEffect（app/(tabs)/index.tsx）が session 参照の変化を検知して再発火し、
    // 確定済みの WakeRecord（完了時刻・所要時間・todos）を新タスクの記録で
    // 上書きしてしまう。UI 側でも全完了後は切り替え導線を隠すが、ストア単体で
    // 呼ばれた場合の安全策としてもここでガードする。
    if (areAllCompleted()) return;

    const updated: MorningSession = {
      ...session,
      todos: [buildInitialSessionTodo(taskType)],
    };
    set({ session: updated });
    await persistSession(updated);
    runEffectFork(syncWidgetEffect);
  },

  /** セッションをクリアする。snooze state は session 内に含まれるため、session = null で自動的にクリアされる。 */
  clearSession: async () => {
    set({ session: null });
    await persistSession(null);
    // ウィジェットにセッション終了を反映（fire-and-forget）
    runEffectFork(syncWidgetEffect);
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

  isExpired: () => {
    const { session } = get();
    if (session === null) return false;
    return Date.now() > new Date(session.windowEnd).getTime();
  },

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
