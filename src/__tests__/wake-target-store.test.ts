import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SOUND_ID } from '../constants/alarm-sounds';
import { useWakeTargetStore } from '../stores/wake-target-store';
import type { WakeTarget } from '../types/wake-target';
import { DEFAULT_WAKE_TARGET } from '../types/wake-target';

const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;

describe('useWakeTargetStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWakeTargetStore.setState({
      target: null,
      loaded: false,
      alarmIds: [],
    });
  });

  test('loadTarget returns disabled fallback when no stored data', async () => {
    mockGetItem.mockResolvedValue(null);
    await useWakeTargetStore.getState().loadTarget();
    const state = useWakeTargetStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.target).toEqual({ ...DEFAULT_WAKE_TARGET, enabled: false });
  });

  test('loadTarget restores stored target', async () => {
    const stored: WakeTarget = {
      ...DEFAULT_WAKE_TARGET,
      defaultTime: { hour: 6, minute: 30 },
    };
    mockGetItem.mockResolvedValue(JSON.stringify(stored));
    await useWakeTargetStore.getState().loadTarget();
    expect(useWakeTargetStore.getState().target?.defaultTime).toEqual({ hour: 6, minute: 30 });
  });

  test('setTarget persists to AsyncStorage', async () => {
    const target: WakeTarget = {
      ...DEFAULT_WAKE_TARGET,
      defaultTime: { hour: 8, minute: 0 },
    };
    await useWakeTargetStore.getState().setTarget(target);
    expect(mockSetItem).toHaveBeenCalledWith('wake-target', JSON.stringify(target));
    expect(useWakeTargetStore.getState().target?.defaultTime).toEqual({ hour: 8, minute: 0 });
  });

  test('updateDefaultTime updates only the time', async () => {
    await useWakeTargetStore.getState().setTarget(DEFAULT_WAKE_TARGET);
    await useWakeTargetStore.getState().updateDefaultTime({ hour: 6, minute: 0 });
    expect(useWakeTargetStore.getState().target?.defaultTime).toEqual({ hour: 6, minute: 0 });
  });

  test('setNextOverride sets and clearNextOverride clears', async () => {
    await useWakeTargetStore.getState().setTarget(DEFAULT_WAKE_TARGET);
    await useWakeTargetStore.getState().setNextOverride({ hour: 5, minute: 30 });
    expect(useWakeTargetStore.getState().target?.nextOverride).toEqual({
      time: { hour: 5, minute: 30 },
    });
    await useWakeTargetStore.getState().clearNextOverride();
    expect(useWakeTargetStore.getState().target?.nextOverride).toBeNull();
  });

  test('setDayOverride and removeDayOverride', async () => {
    await useWakeTargetStore.getState().setTarget(DEFAULT_WAKE_TARGET);
    await useWakeTargetStore.getState().setDayOverride(0, { type: 'off' });
    expect(useWakeTargetStore.getState().target?.dayOverrides[0]).toEqual({ type: 'off' });
    await useWakeTargetStore.getState().removeDayOverride(0);
    expect(useWakeTargetStore.getState().target?.dayOverrides[0]).toBeUndefined();
  });

  test('addTodo and removeTodo', async () => {
    await useWakeTargetStore.getState().setTarget(DEFAULT_WAKE_TARGET);
    await useWakeTargetStore.getState().addTodo('Drink water');
    const todos = useWakeTargetStore.getState().target?.todos ?? [];
    expect(todos).toHaveLength(1);
    expect(todos[0]?.title).toBe('Drink water');

    const todoId = todos[0]?.id ?? '';
    await useWakeTargetStore.getState().removeTodo(todoId);
    expect(useWakeTargetStore.getState().target?.todos).toHaveLength(0);
  });

  test('toggleEnabled flips the enabled flag', async () => {
    await useWakeTargetStore.getState().setTarget(DEFAULT_WAKE_TARGET);
    expect(useWakeTargetStore.getState().target?.enabled).toBe(true);
    await useWakeTargetStore.getState().toggleEnabled();
    expect(useWakeTargetStore.getState().target?.enabled).toBe(false);
  });

  test('toggleTodoCompleted flips todo completed state', async () => {
    await useWakeTargetStore.getState().setTarget({
      ...DEFAULT_WAKE_TARGET,
      todos: [{ id: 'todo-1', title: 'Test', completed: false }],
    });
    useWakeTargetStore.getState().toggleTodoCompleted('todo-1');
    expect(useWakeTargetStore.getState().target?.todos[0]?.completed).toBe(true);
  });

  test('resetTodos sets all todos to not completed', async () => {
    await useWakeTargetStore.getState().setTarget({
      ...DEFAULT_WAKE_TARGET,
      todos: [
        { id: 'todo-1', title: 'A', completed: true },
        { id: 'todo-2', title: 'B', completed: true },
      ],
    });
    useWakeTargetStore.getState().resetTodos();
    const todos = useWakeTargetStore.getState().target?.todos ?? [];
    expect(todos.every((t) => !t.completed)).toBe(true);
  });

  test('areAllTodosCompleted returns true when all done', async () => {
    await useWakeTargetStore.getState().setTarget({
      ...DEFAULT_WAKE_TARGET,
      todos: [
        { id: 'todo-1', title: 'A', completed: true },
        { id: 'todo-2', title: 'B', completed: true },
      ],
    });
    expect(useWakeTargetStore.getState().areAllTodosCompleted()).toBe(true);
  });

  test('reorderTodos persists new order', async () => {
    const todos = [
      { id: 'todo-1', title: 'A', completed: false },
      { id: 'todo-2', title: 'B', completed: false },
    ];
    await useWakeTargetStore.getState().setTarget({
      ...DEFAULT_WAKE_TARGET,
      todos,
    });
    const reordered = [todos[1], todos[0]].filter(
      (t): t is (typeof todos)[number] => t !== undefined,
    );
    await useWakeTargetStore.getState().reorderTodos(reordered);
    expect(useWakeTargetStore.getState().target?.todos[0]?.id).toBe('todo-2');
    expect(useWakeTargetStore.getState().target?.todos[1]?.id).toBe('todo-1');
  });

  test('setAlarmIds persists to AsyncStorage', async () => {
    const ids = ['alarm-1', 'alarm-2', 'alarm-3'];
    await useWakeTargetStore.getState().setAlarmIds(ids);
    expect(useWakeTargetStore.getState().alarmIds).toEqual(ids);
    expect(mockSetItem).toHaveBeenCalledWith('alarm-ids', JSON.stringify(ids));
  });

  test('loadTarget restores alarmIds from AsyncStorage', async () => {
    const ids = ['alarm-a', 'alarm-b'];
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'wake-target') return Promise.resolve(null);
      if (key === 'alarm-ids') return Promise.resolve(JSON.stringify(ids));
      return Promise.resolve(null);
    });
    await useWakeTargetStore.getState().loadTarget();
    expect(useWakeTargetStore.getState().alarmIds).toEqual(ids);
  });

  test('setSoundId updates the sound and persists', async () => {
    await useWakeTargetStore.getState().setTarget(DEFAULT_WAKE_TARGET);
    mockSetItem.mockClear();
    await useWakeTargetStore.getState().setSoundId('chime');
    expect(useWakeTargetStore.getState().target?.soundId).toBe('chime');
    expect(mockSetItem).toHaveBeenCalledWith(
      'wake-target',
      expect.stringContaining('"soundId":"chime"'),
    );
  });

  test('loadTarget migrates missing soundId to default', async () => {
    // Simulate a stored target without soundId (pre-migration data)
    const legacyTarget = {
      defaultTime: { hour: 7, minute: 0 },
      dayOverrides: {},
      nextOverride: null,
      todos: [],
      enabled: true,
    };
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'wake-target') return Promise.resolve(JSON.stringify(legacyTarget));
      return Promise.resolve(null);
    });
    await useWakeTargetStore.getState().loadTarget();
    expect(useWakeTargetStore.getState().target?.soundId).toBe(DEFAULT_SOUND_ID);
  });

  test('setSoundId updates the sound and persists', async () => {
    await useWakeTargetStore.getState().setTarget(DEFAULT_WAKE_TARGET);
    mockSetItem.mockClear();
    await useWakeTargetStore.getState().setSoundId('chime');
    expect(useWakeTargetStore.getState().target?.soundId).toBe('chime');
    expect(mockSetItem).toHaveBeenCalledWith(
      'wake-target',
      expect.stringContaining('"soundId":"chime"'),
    );
  });

  test('loadTarget migrates missing soundId to default', async () => {
    // Simulate a stored target without soundId (pre-migration data)
    const legacyTarget = {
      defaultTime: { hour: 7, minute: 0 },
      dayOverrides: {},
      nextOverride: null,
      todos: [],
      enabled: true,
    };
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'wake-target') return Promise.resolve(JSON.stringify(legacyTarget));
      return Promise.resolve(null);
    });
    await useWakeTargetStore.getState().loadTarget();
    expect(useWakeTargetStore.getState().target?.soundId).toBe(DEFAULT_SOUND_ID);
  });
});
