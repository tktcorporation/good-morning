import { useAlarmStore } from '../stores/alarm-store';
import type { AlarmFormData } from '../types/alarm';

// Reset store state between tests
beforeEach(() => {
  useAlarmStore.setState({ alarms: [], loaded: false, activeAlarmId: null });
});

const sampleAlarmData: AlarmFormData = {
  time: { hour: 7, minute: 30 },
  label: 'Morning Alarm',
  todos: [
    { id: 'todo-1', title: 'Drink water', completed: false },
    { id: 'todo-2', title: 'Stretch', completed: false },
  ],
  repeatDays: [1, 2, 3, 4, 5],
};

describe('alarm store', () => {
  it('starts with empty alarms and not loaded', () => {
    const state = useAlarmStore.getState();
    expect(state.alarms).toEqual([]);
    expect(state.loaded).toBe(false);
    expect(state.activeAlarmId).toBeNull();
  });

  it('adds an alarm', async () => {
    const alarm = await useAlarmStore.getState().addAlarm(sampleAlarmData);

    expect(alarm.time).toEqual({ hour: 7, minute: 30 });
    expect(alarm.label).toBe('Morning Alarm');
    expect(alarm.todos).toHaveLength(2);
    expect(alarm.enabled).toBe(true);

    const state = useAlarmStore.getState();
    expect(state.alarms).toHaveLength(1);
  });

  it('deletes an alarm', async () => {
    const alarm = await useAlarmStore.getState().addAlarm(sampleAlarmData);
    expect(useAlarmStore.getState().alarms).toHaveLength(1);

    await useAlarmStore.getState().deleteAlarm(alarm.id);
    expect(useAlarmStore.getState().alarms).toHaveLength(0);
  });

  it('toggles alarm enabled state', async () => {
    const alarm = await useAlarmStore.getState().addAlarm(sampleAlarmData);
    expect(alarm.enabled).toBe(true);

    await useAlarmStore.getState().toggleAlarm(alarm.id);
    const toggled = useAlarmStore.getState().alarms.find((a) => a.id === alarm.id);
    expect(toggled?.enabled).toBe(false);
  });

  it('toggles a todo item', async () => {
    const alarm = await useAlarmStore.getState().addAlarm(sampleAlarmData);

    useAlarmStore.getState().toggleTodo(alarm.id, 'todo-1');
    const updated = useAlarmStore.getState().alarms.find((a) => a.id === alarm.id);
    const todo = updated?.todos.find((t) => t.id === 'todo-1');
    expect(todo?.completed).toBe(true);
  });

  it('checks if all todos are completed', async () => {
    const alarm = await useAlarmStore.getState().addAlarm(sampleAlarmData);

    expect(useAlarmStore.getState().areAllTodosCompleted(alarm.id)).toBe(false);

    useAlarmStore.getState().toggleTodo(alarm.id, 'todo-1');
    expect(useAlarmStore.getState().areAllTodosCompleted(alarm.id)).toBe(false);

    useAlarmStore.getState().toggleTodo(alarm.id, 'todo-2');
    expect(useAlarmStore.getState().areAllTodosCompleted(alarm.id)).toBe(true);
  });

  it('resets all todos to incomplete', async () => {
    const alarm = await useAlarmStore.getState().addAlarm(sampleAlarmData);

    useAlarmStore.getState().toggleTodo(alarm.id, 'todo-1');
    useAlarmStore.getState().toggleTodo(alarm.id, 'todo-2');
    expect(useAlarmStore.getState().areAllTodosCompleted(alarm.id)).toBe(true);

    useAlarmStore.getState().resetTodos(alarm.id);
    expect(useAlarmStore.getState().areAllTodosCompleted(alarm.id)).toBe(false);
  });

  it('sets active alarm', async () => {
    const alarm = await useAlarmStore.getState().addAlarm(sampleAlarmData);

    useAlarmStore.getState().setActiveAlarm(alarm.id);
    expect(useAlarmStore.getState().activeAlarmId).toBe(alarm.id);

    useAlarmStore.getState().setActiveAlarm(null);
    expect(useAlarmStore.getState().activeAlarmId).toBeNull();
  });

  it('updates alarm properties', async () => {
    const alarm = await useAlarmStore.getState().addAlarm(sampleAlarmData);

    await useAlarmStore.getState().updateAlarm(alarm.id, {
      label: 'Updated Label',
      time: { hour: 8, minute: 0 },
    });

    const updated = useAlarmStore.getState().alarms.find((a) => a.id === alarm.id);
    expect(updated?.label).toBe('Updated Label');
    expect(updated?.time).toEqual({ hour: 8, minute: 0 });
  });

  it('returns true for areAllTodosCompleted when alarm has no todos', () => {
    expect(useAlarmStore.getState().areAllTodosCompleted('nonexistent')).toBe(true);
  });
});
