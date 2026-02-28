import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMorningSessionStore } from '../stores/morning-session-store';
import type { SessionTodo } from '../types/morning-session';

beforeEach(() => {
  useMorningSessionStore.setState({
    session: null,
    loaded: false,
    snoozeAlarmIds: [],
    snoozeFiresAt: null,
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
    await useMorningSessionStore.getState().startSession('wake_123', '2026-02-22', sampleTodos);
    const state = useMorningSessionStore.getState();
    expect(state.session).not.toBeNull();
    expect(state.session?.recordId).toBe('wake_123');
    expect(state.session?.date).toBe('2026-02-22');
    expect(state.session?.todos).toHaveLength(3);
    expect(state.isActive()).toBe(true);
  });

  it('toggles a todo to completed', async () => {
    await useMorningSessionStore.getState().startSession('wake_123', '2026-02-22', sampleTodos);
    await useMorningSessionStore.getState().toggleTodo('todo_1');

    const state = useMorningSessionStore.getState();
    const todo = state.session?.todos.find((t) => t.id === 'todo_1');
    expect(todo?.completed).toBe(true);
    expect(todo?.completedAt).not.toBeNull();
  });

  it('toggles a todo back to incomplete', async () => {
    await useMorningSessionStore.getState().startSession('wake_123', '2026-02-22', sampleTodos);
    await useMorningSessionStore.getState().toggleTodo('todo_1');
    await useMorningSessionStore.getState().toggleTodo('todo_1');

    const state = useMorningSessionStore.getState();
    const todo = state.session?.todos.find((t) => t.id === 'todo_1');
    expect(todo?.completed).toBe(false);
    expect(todo?.completedAt).toBeNull();
  });

  it('reports progress correctly', async () => {
    await useMorningSessionStore.getState().startSession('wake_123', '2026-02-22', sampleTodos);

    expect(useMorningSessionStore.getState().getProgress()).toEqual({ completed: 0, total: 3 });

    await useMorningSessionStore.getState().toggleTodo('todo_1');
    expect(useMorningSessionStore.getState().getProgress()).toEqual({ completed: 1, total: 3 });

    await useMorningSessionStore.getState().toggleTodo('todo_2');
    expect(useMorningSessionStore.getState().getProgress()).toEqual({ completed: 2, total: 3 });
  });

  it('reports all completed correctly', async () => {
    await useMorningSessionStore.getState().startSession('wake_123', '2026-02-22', sampleTodos);
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
    await useMorningSessionStore.getState().startSession('wake_123', '2026-02-22', sampleTodos);
    await useMorningSessionStore.getState().clearSession();

    const state = useMorningSessionStore.getState();
    expect(state.session).toBeNull();
    expect(state.isActive()).toBe(false);
  });

  it('returns zero progress when no session', () => {
    expect(useMorningSessionStore.getState().getProgress()).toEqual({ completed: 0, total: 0 });
  });

  describe('snooze state', () => {
    it('stores snoozeAlarmIds when set', async () => {
      await useMorningSessionStore.getState().startSession('wake_123', '2026-02-22', sampleTodos);
      useMorningSessionStore.getState().setSnoozeAlarmIds(['snooze-1', 'snooze-2']);
      expect(useMorningSessionStore.getState().snoozeAlarmIds).toEqual(['snooze-1', 'snooze-2']);
    });

    it('clears snoozeAlarmIds on clearSession', async () => {
      await useMorningSessionStore.getState().startSession('wake_123', '2026-02-22', sampleTodos);
      useMorningSessionStore.getState().setSnoozeAlarmIds(['snooze-1', 'snooze-2']);
      await useMorningSessionStore.getState().clearSession();
      expect(useMorningSessionStore.getState().snoozeAlarmIds).toEqual([]);
    });

    it('stores snoozeFiresAt timestamp', async () => {
      await useMorningSessionStore.getState().startSession('wake_123', '2026-02-22', sampleTodos);
      const fireTime = '2026-02-22T07:09:00.000Z';
      useMorningSessionStore.getState().setSnoozeFiresAt(fireTime);
      expect(useMorningSessionStore.getState().snoozeFiresAt).toBe(fireTime);
    });

    it('clears snoozeFiresAt on clearSession', async () => {
      await useMorningSessionStore.getState().startSession('wake_123', '2026-02-22', sampleTodos);
      useMorningSessionStore.getState().setSnoozeFiresAt('2026-02-22T07:09:00.000Z');
      await useMorningSessionStore.getState().clearSession();
      expect(useMorningSessionStore.getState().snoozeFiresAt).toBeNull();
    });

    it('initializes snooze state as empty/null in new session', async () => {
      await useMorningSessionStore.getState().startSession('wake_123', '2026-02-22', sampleTodos);
      expect(useMorningSessionStore.getState().snoozeAlarmIds).toEqual([]);
      expect(useMorningSessionStore.getState().snoozeFiresAt).toBeNull();
    });
  });

  describe('live activity state', () => {
    it('stores liveActivityId in session when set', async () => {
      await useMorningSessionStore.getState().startSession('wake_123', '2026-02-22', sampleTodos);
      await useMorningSessionStore.getState().setLiveActivityId('activity-xyz');
      expect(useMorningSessionStore.getState().session?.liveActivityId).toBe('activity-xyz');
    });

    it('initializes liveActivityId as null in new session', async () => {
      await useMorningSessionStore.getState().startSession('wake_123', '2026-02-22', sampleTodos);
      expect(useMorningSessionStore.getState().session?.liveActivityId).toBeNull();
    });

    it('clears liveActivityId on clearSession (session is null)', async () => {
      await useMorningSessionStore.getState().startSession('wake_123', '2026-02-22', sampleTodos);
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
  });
});
