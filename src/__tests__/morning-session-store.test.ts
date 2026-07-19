import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMorningSessionStore } from '../stores/morning-session-store';
import type { SessionTodo } from '../types/morning-session';

beforeEach(() => {
  useMorningSessionStore.setState({
    session: null,
    loaded: false,
  });
});

const sampleTodos: readonly SessionTodo[] = [
  { id: 'todo_1', title: 'Drink water', completed: false, completedAt: null },
  { id: 'todo_2', title: 'Stretch', completed: false, completedAt: null },
  { id: 'todo_3', title: 'Meditate', completed: false, completedAt: null },
];

describe('morning-session-store', () => {
  it('starts with no session', () => {
    const state = useMorningSessionStore.getState();
    expect(state.session).toBeNull();
    expect(state.isActive()).toBe(false);
  });

  it('starts a session', async () => {
    await useMorningSessionStore
      .getState()
      .startSession('2026-02-22', sampleTodos, null, '2026-02-22T08:00:00.000Z');
    const state = useMorningSessionStore.getState();
    expect(state.session).not.toBeNull();
    expect(state.session?.recordId).toBeNull();
    expect(state.session?.date).toBe('2026-02-22');
    expect(state.session?.todos).toHaveLength(3);
    expect(state.isActive()).toBe(true);
  });

  it('toggles a todo to completed', async () => {
    await useMorningSessionStore
      .getState()
      .startSession('2026-02-22', sampleTodos, null, '2026-02-22T08:00:00.000Z');
    await useMorningSessionStore.getState().toggleTodo('todo_1');

    const state = useMorningSessionStore.getState();
    const todo = state.session?.todos.find((t) => t.id === 'todo_1');
    expect(todo?.completed).toBe(true);
    expect(todo?.completedAt).not.toBeNull();
  });

  it('toggles a todo back to incomplete', async () => {
    await useMorningSessionStore
      .getState()
      .startSession('2026-02-22', sampleTodos, null, '2026-02-22T08:00:00.000Z');
    await useMorningSessionStore.getState().toggleTodo('todo_1');
    await useMorningSessionStore.getState().toggleTodo('todo_1');

    const state = useMorningSessionStore.getState();
    const todo = state.session?.todos.find((t) => t.id === 'todo_1');
    expect(todo?.completed).toBe(false);
    expect(todo?.completedAt).toBeNull();
  });

  it('reports progress correctly', async () => {
    await useMorningSessionStore
      .getState()
      .startSession('2026-02-22', sampleTodos, null, '2026-02-22T08:00:00.000Z');

    expect(useMorningSessionStore.getState().getProgress()).toEqual({ completed: 0, total: 3 });

    await useMorningSessionStore.getState().toggleTodo('todo_1');
    expect(useMorningSessionStore.getState().getProgress()).toEqual({ completed: 1, total: 3 });

    await useMorningSessionStore.getState().toggleTodo('todo_2');
    expect(useMorningSessionStore.getState().getProgress()).toEqual({ completed: 2, total: 3 });
  });

  it('reports all completed correctly', async () => {
    await useMorningSessionStore
      .getState()
      .startSession('2026-02-22', sampleTodos, null, '2026-02-22T08:00:00.000Z');
    expect(useMorningSessionStore.getState().areAllCompleted()).toBe(false);

    await useMorningSessionStore.getState().toggleTodo('todo_1');
    await useMorningSessionStore.getState().toggleTodo('todo_2');
    await useMorningSessionStore.getState().toggleTodo('todo_3');
    expect(useMorningSessionStore.getState().areAllCompleted()).toBe(true);
  });

  it('returns false for areAllCompleted when no session', () => {
    expect(useMorningSessionStore.getState().areAllCompleted()).toBe(false);
  });

  it('clears the session', async () => {
    await useMorningSessionStore
      .getState()
      .startSession('2026-02-22', sampleTodos, null, '2026-02-22T08:00:00.000Z');
    await useMorningSessionStore.getState().clearSession();

    const state = useMorningSessionStore.getState();
    expect(state.session).toBeNull();
    expect(state.isActive()).toBe(false);
  });

  it('returns zero progress when no session', () => {
    expect(useMorningSessionStore.getState().getProgress()).toEqual({ completed: 0, total: 0 });
  });

  describe('snooze state', () => {
    it('sets snoozeAlarmIds and snoozeFiresAt atomically via setSnoozeState', async () => {
      await useMorningSessionStore
        .getState()
        .startSession('2026-02-22', sampleTodos, null, '2026-02-22T08:00:00.000Z');
      const fireTime = '2026-02-22T07:09:00.000Z';
      await useMorningSessionStore.getState().setSnoozeState(['snooze-1', 'snooze-2'], fireTime);
      const session = useMorningSessionStore.getState().session;
      expect(session?.snoozeAlarmIds).toEqual(['snooze-1', 'snooze-2']);
      expect(session?.snoozeFiresAt).toBe(fireTime);
    });

    it('clears snooze state on clearSession (session becomes null)', async () => {
      await useMorningSessionStore
        .getState()
        .startSession('2026-02-22', sampleTodos, null, '2026-02-22T08:00:00.000Z');
      await useMorningSessionStore
        .getState()
        .setSnoozeState(['snooze-1', 'snooze-2'], '2026-02-22T07:09:00.000Z');
      await useMorningSessionStore.getState().clearSession();
      expect(useMorningSessionStore.getState().session).toBeNull();
    });

    it('stores snoozeFiresAt timestamp via setSnoozeFiresAt', async () => {
      await useMorningSessionStore
        .getState()
        .startSession('2026-02-22', sampleTodos, null, '2026-02-22T08:00:00.000Z');
      const fireTime = '2026-02-22T07:09:00.000Z';
      await useMorningSessionStore.getState().setSnoozeFiresAt(fireTime);
      expect(useMorningSessionStore.getState().session?.snoozeFiresAt).toBe(fireTime);
    });

    it('clears snoozeFiresAt via setSnoozeFiresAt(null)', async () => {
      await useMorningSessionStore
        .getState()
        .startSession('2026-02-22', sampleTodos, null, '2026-02-22T08:00:00.000Z');
      await useMorningSessionStore.getState().setSnoozeFiresAt('2026-02-22T07:09:00.000Z');
      await useMorningSessionStore.getState().setSnoozeFiresAt(null);
      expect(useMorningSessionStore.getState().session?.snoozeFiresAt).toBeNull();
    });

    it('initializes snooze state as empty/null in new session', async () => {
      await useMorningSessionStore
        .getState()
        .startSession('2026-02-22', sampleTodos, null, '2026-02-22T08:00:00.000Z');
      expect(useMorningSessionStore.getState().session?.snoozeAlarmIds).toEqual([]);
      expect(useMorningSessionStore.getState().session?.snoozeFiresAt).toBeNull();
    });

    it('does nothing when setSnoozeState is called without session', async () => {
      await useMorningSessionStore
        .getState()
        .setSnoozeState(['snooze-1'], '2026-02-22T07:09:00.000Z');
      expect(useMorningSessionStore.getState().session).toBeNull();
    });

    it('does nothing when setSnoozeFiresAt is called without session', async () => {
      await useMorningSessionStore.getState().setSnoozeFiresAt('2026-02-22T07:09:00.000Z');
      expect(useMorningSessionStore.getState().session).toBeNull();
    });

    it('persists snooze state and restores on reload', async () => {
      await useMorningSessionStore
        .getState()
        .startSession('2026-02-22', sampleTodos, null, '2026-02-22T08:00:00.000Z');
      const fireTime = '2026-02-22T07:09:00.000Z';
      await useMorningSessionStore.getState().setSnoozeState(['snooze-1', 'snooze-2'], fireTime);

      // リセットしてリロード
      useMorningSessionStore.setState({ session: null, loaded: false });
      await useMorningSessionStore.getState().loadSession();

      const session = useMorningSessionStore.getState().session;
      expect(session?.snoozeAlarmIds).toEqual(['snooze-1', 'snooze-2']);
      expect(session?.snoozeFiresAt).toBe(fireTime);
    });

    it('migrates snooze fields to defaults when loading legacy data without them', async () => {
      // レガシーデータ: snoozeAlarmIds / snoozeFiresAt フィールドが存在しない
      const legacyData = {
        recordId: 'wake_legacy',
        date: '2026-02-22',
        startedAt: '2026-02-22T07:00:00.000Z',
        todos: [{ id: 'todo_1', title: 'Test', completed: false, completedAt: null }],
        liveActivityId: null,
        goalDeadline: null,
      };
      await AsyncStorage.setItem('morning-session', JSON.stringify(legacyData));

      await useMorningSessionStore.getState().loadSession();
      const session = useMorningSessionStore.getState().session;
      expect(session).not.toBeNull();
      // undefined ではなくデフォルト値にマイグレーションされていること
      expect(session?.snoozeAlarmIds).toEqual([]);
      expect(session?.snoozeFiresAt).toBeNull();
    });

    it('falls back windowEnd to startedAt + 60min when missing in legacy data', async () => {
      // windowEnd は isExpired を駆動するため、欠落時は startedAt + 60 分を補う。
      const legacyData = {
        recordId: 'wake_legacy',
        date: '2026-02-22',
        startedAt: '2026-02-22T07:00:00.000Z',
        todos: [{ id: 'todo_1', title: 'Test', completed: false, completedAt: null }],
      };
      await AsyncStorage.setItem('morning-session', JSON.stringify(legacyData));

      await useMorningSessionStore.getState().loadSession();
      expect(useMorningSessionStore.getState().session?.windowEnd).toBe('2026-02-22T08:00:00.000Z');
    });
  });

  describe('live activity state', () => {
    it('stores liveActivityId in session when set', async () => {
      await useMorningSessionStore
        .getState()
        .startSession('2026-02-22', sampleTodos, null, '2026-02-22T08:00:00.000Z');
      await useMorningSessionStore.getState().setLiveActivityId('activity-xyz');
      expect(useMorningSessionStore.getState().session?.liveActivityId).toBe('activity-xyz');
    });

    it('initializes liveActivityId as null in new session', async () => {
      await useMorningSessionStore
        .getState()
        .startSession('2026-02-22', sampleTodos, null, '2026-02-22T08:00:00.000Z');
      expect(useMorningSessionStore.getState().session?.liveActivityId).toBeNull();
    });

    it('clears liveActivityId on clearSession (session is null)', async () => {
      await useMorningSessionStore
        .getState()
        .startSession('2026-02-22', sampleTodos, null, '2026-02-22T08:00:00.000Z');
      await useMorningSessionStore.getState().setLiveActivityId('activity-xyz');
      await useMorningSessionStore.getState().clearSession();
      expect(useMorningSessionStore.getState().session).toBeNull();
    });

    it('does nothing when setLiveActivityId is called without session', async () => {
      await useMorningSessionStore.getState().setLiveActivityId('activity-xyz');
      expect(useMorningSessionStore.getState().session).toBeNull();
    });

    it('migrates liveActivityId to null when loading legacy data without the field', async () => {
      // レガシーデータ: liveActivityId フィールドが存在しない
      const legacyData = {
        recordId: 'wake_legacy',
        date: '2026-02-22',
        startedAt: '2026-02-22T07:00:00.000Z',
        todos: [{ id: 'todo_1', title: 'Test', completed: false, completedAt: null }],
      };
      await AsyncStorage.setItem('morning-session', JSON.stringify(legacyData));

      await useMorningSessionStore.getState().loadSession();
      const state = useMorningSessionStore.getState();
      expect(state.session).not.toBeNull();
      // undefined ではなく null にマイグレーションされていること
      expect(state.session?.liveActivityId).toBeNull();
    });

    it('migrates goalDeadline to null when loading legacy data without the field', async () => {
      const legacyData = {
        recordId: 'wake_legacy',
        date: '2026-02-22',
        startedAt: '2026-02-22T07:00:00.000Z',
        todos: [{ id: 'todo_1', title: 'Test', completed: false, completedAt: null }],
        liveActivityId: null,
      };
      await AsyncStorage.setItem('morning-session', JSON.stringify(legacyData));

      await useMorningSessionStore.getState().loadSession();
      const state = useMorningSessionStore.getState();
      expect(state.session).not.toBeNull();
      expect(state.session?.goalDeadline).toBeNull();
    });
  });

  describe('goalDeadline', () => {
    it('stores goalDeadline in session when started', async () => {
      const deadline = '2026-02-22T07:30:00.000Z';
      await useMorningSessionStore
        .getState()
        .startSession('2026-02-22', sampleTodos, deadline, '2026-02-22T08:00:00.000Z');
      expect(useMorningSessionStore.getState().session?.goalDeadline).toBe(deadline);
    });

    it('stores null goalDeadline when not provided', async () => {
      await useMorningSessionStore
        .getState()
        .startSession('2026-02-22', sampleTodos, null, '2026-02-22T08:00:00.000Z');
      expect(useMorningSessionStore.getState().session?.goalDeadline).toBeNull();
    });
  });
});

describe('loadSession', () => {
  test('AsyncStorage.getItem が一時的に reject してもリトライで復旧し、永続化済みセッションを失わない', async () => {
    // 1回目は一時的な失敗、2回目で成功するケース。ここで即座に session=null に
    // 倒すと、実際には永続化されている進行中セッションを「存在しない」ものとして
    // 扱ってしまい、syncAlarmsEffect が生存中のスヌーズを孤立キャンセルしたり、
    // 自動開始処理が新規セッションで上書きしてしまう
    const storedSession = {
      recordId: 'wake_existing',
      date: '2026-02-22',
      startedAt: '2026-02-22T07:00:00.000Z',
      todos: [{ id: 'todo_1', title: 'Test', completed: false, completedAt: null }],
      liveActivityId: null,
      goalDeadline: null,
    };
    (AsyncStorage.getItem as jest.Mock)
      .mockRejectedValueOnce(new Error('transient storage error'))
      .mockResolvedValueOnce(JSON.stringify(storedSession));
    await expect(useMorningSessionStore.getState().loadSession()).resolves.toBeUndefined();
    const state = useMorningSessionStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.session?.recordId).toBe('wake_existing');
  });

  test('AsyncStorage.getItem がリトライしても reject し続ける場合、loaded=false のまま留まり既存セッションを破棄しない', async () => {
    // 読み取り自体が失敗し続ける場合、永続化済みセッションの有無が確認できて
    // いない。loaded=true・session=null にすると、生存中のスヌーズが孤立
    // キャンセルされたり新規セッションで上書きされてしまうため、loaded=false の
    // まま留めて以降の再試行（アプリ再起動等）に委ねる
    // StorageService の読み取りリトライ回数（3回）分だけ reject を積む。
    // mockRejectedValue（永続）だと以降のテストにもモックが漏れ出すため使わない
    (AsyncStorage.getItem as jest.Mock)
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockRejectedValueOnce(new Error('storage unavailable'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(useMorningSessionStore.getState().loadSession()).resolves.toBeUndefined();
    const state = useMorningSessionStore.getState();
    expect(state.loaded).toBe(false);
    expect(state.session).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  test('破損 JSON では reject せず loaded=true・session=null で確定する（データは読めたが復元不能なため）', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('not-json{{{');
    await expect(useMorningSessionStore.getState().loadSession()).resolves.toBeUndefined();
    const state = useMorningSessionStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.session).toBeNull();
  });

  test('startedAt が ISO パース不能な場合も reject せず loaded=true・session=null で確定する（RangeError が漏れない）', async () => {
    const storedSession = {
      recordId: null,
      date: '2026-02-22',
      startedAt: 'not-a-valid-date',
      todos: [],
      liveActivityId: null,
      goalDeadline: null,
    };
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(storedSession));
    await expect(useMorningSessionStore.getState().loadSession()).resolves.toBeUndefined();
    const state = useMorningSessionStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.session).toBeNull();
  });

  test('todos内の1件が不正な形状でも、recordId/snooze状態等は失わず不正なtodoだけをスキップする', async () => {
    const storedSession = {
      recordId: 'wake_1',
      date: '2026-02-22',
      startedAt: '2026-02-22T07:00:00.000Z',
      todos: [
        { id: 'todo_1', title: 'Valid', completed: false, completedAt: null },
        { id: 'todo_2' }, // title 欠落 → この要素だけスキップされる
      ],
      liveActivityId: null,
      goalDeadline: null,
      snoozeAlarmIds: ['alarm_1', 'alarm_2'],
      snoozeFiresAt: '2026-02-22T07:10:00.000Z',
    };
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(storedSession));
    await expect(useMorningSessionStore.getState().loadSession()).resolves.toBeUndefined();
    const state = useMorningSessionStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.session?.recordId).toBe('wake_1');
    expect(state.session?.snoozeAlarmIds).toEqual(['alarm_1', 'alarm_2']);
    expect(state.session?.snoozeFiresAt).toBe('2026-02-22T07:10:00.000Z');
    expect(state.session?.todos).toHaveLength(1);
    expect(state.session?.todos[0]?.id).toBe('todo_1');
  });
});
