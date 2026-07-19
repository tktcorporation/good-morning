import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWakeRecordStore } from '../stores/wake-record-store';
import type { WakeRecord } from '../types/wake-record';

const mockGetItem = AsyncStorage.getItem as jest.Mock;

beforeEach(() => {
  useWakeRecordStore.setState({ records: [], loaded: false });
  mockGetItem.mockReset();
  mockGetItem.mockResolvedValue(null);
});

const sampleRecord: Omit<WakeRecord, 'id'> = {
  alarmId: 'alarm_1',
  date: '2026-02-22',
  targetTime: { hour: 7, minute: 0 },
  alarmTriggeredAt: '2026-02-22T07:00:00.000Z',
  dismissedAt: '2026-02-22T07:03:00.000Z',
  healthKitWakeTime: null,
  result: 'great',
  diffMinutes: 3,
  todos: [
    {
      id: 'todo_1',
      title: 'Drink water',
      completedAt: '2026-02-22T07:01:00.000Z',
      orderCompleted: 1,
    },
    { id: 'todo_2', title: 'Stretch', completedAt: '2026-02-22T07:02:30.000Z', orderCompleted: 2 },
  ],
  todoCompletionSeconds: 150,
  alarmLabel: 'Morning',
  todosCompleted: true,
  todosCompletedAt: '2026-02-22T07:03:00.000Z',
  goalDeadline: null,
};

describe('wake-record store', () => {
  it('starts with empty records', () => {
    const state = useWakeRecordStore.getState();
    expect(state.records).toEqual([]);
    expect(state.loaded).toBe(false);
  });

  it('adds a record', async () => {
    await useWakeRecordStore.getState().addRecord(sampleRecord);
    const state = useWakeRecordStore.getState();
    expect(state.records).toHaveLength(1);
    expect(state.records[0]?.result).toBe('great');
  });

  it('calculates current streak', async () => {
    const store = useWakeRecordStore.getState();
    await store.addRecord({ ...sampleRecord, date: '2026-02-20', result: 'great' });
    await store.addRecord({ ...sampleRecord, date: '2026-02-21', result: 'great' });
    await store.addRecord({ ...sampleRecord, date: '2026-02-22', result: 'great' });
    expect(useWakeRecordStore.getState().getCurrentStreak()).toBe(3);
  });

  it('breaks streak on late day', async () => {
    const store = useWakeRecordStore.getState();
    await store.addRecord({ ...sampleRecord, date: '2026-02-20', result: 'great' });
    await store.addRecord({ ...sampleRecord, date: '2026-02-21', result: 'late' });
    await store.addRecord({ ...sampleRecord, date: '2026-02-22', result: 'great' });
    expect(useWakeRecordStore.getState().getCurrentStreak()).toBe(1);
  });

  it('updates todosCompleted via updateRecord', async () => {
    const store = useWakeRecordStore.getState();
    const record = await store.addRecord({
      ...sampleRecord,
      todosCompleted: false,
      todosCompletedAt: null,
    });
    await useWakeRecordStore.getState().updateRecord(record.id, {
      todosCompleted: true,
      todosCompletedAt: '2026-02-22T07:10:00.000Z',
      todoCompletionSeconds: 420,
    });
    const updated = useWakeRecordStore.getState().records.find((r) => r.id === record.id);
    expect(updated?.todosCompleted).toBe(true);
    expect(updated?.todosCompletedAt).toBe('2026-02-22T07:10:00.000Z');
    expect(updated?.todoCompletionSeconds).toBe(420);
  });

  it('overwrites existing record when adding duplicate date', async () => {
    const store = useWakeRecordStore.getState();
    const first = await store.addRecord({ ...sampleRecord, result: 'ok' });
    const second = await store.addRecord({ ...sampleRecord, result: 'great' });

    const state = useWakeRecordStore.getState();
    expect(state.records).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(state.records[0]?.result).toBe('great');
  });

  it('calculates week stats', async () => {
    const store = useWakeRecordStore.getState();
    await store.addRecord({ ...sampleRecord, date: '2026-02-16', result: 'great', diffMinutes: 2 });
    await store.addRecord({ ...sampleRecord, date: '2026-02-17', result: 'ok', diffMinutes: 8 });
    await store.addRecord({ ...sampleRecord, date: '2026-02-18', result: 'late', diffMinutes: 20 });

    const stats = useWakeRecordStore.getState().getWeekStats('2026-02-16');
    expect(stats.totalRecords).toBe(3);
    expect(stats.successRate).toBeCloseTo(66.7, 0);
    expect(stats.averageDiffMinutes).toBe(10);
  });
});

describe('loadRecords', () => {
  // AsyncStorage.getItem や JSON.parse が失敗すると loadRecords が reject し、
  // loaded=false のまま固まる。すると syncAlarmsEffect 等の「records ロード待ち」
  // ガードが永久に解除されず、target 変更などの明示的な操作をしてもアラーム同期が
  // 二度と走らなくなる。読み取り・パースいずれの失敗でも reject せず、
  // 空の records で loaded=true に到達する必要がある

  test('AsyncStorage.getItem が reject しても loaded=true・records=[] で復旧する', async () => {
    mockGetItem.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(useWakeRecordStore.getState().loadRecords()).resolves.toBeUndefined();
    const state = useWakeRecordStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.records).toEqual([]);
  });

  test('破損 JSON でも reject せず loaded=true・records=[] で復旧する', async () => {
    mockGetItem.mockResolvedValueOnce('not-json{{{');
    await expect(useWakeRecordStore.getState().loadRecords()).resolves.toBeUndefined();
    const state = useWakeRecordStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.records).toEqual([]);
  });
});
