import { useWakeRecordStore } from '../stores/wake-record-store';
import type { WakeRecord } from '../types/wake-record';

beforeEach(() => {
  useWakeRecordStore.setState({ records: [], loaded: false });
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

  it('calculates week stats', async () => {
    const store = useWakeRecordStore.getState();
    await store.addRecord({ ...sampleRecord, date: '2026-02-16', result: 'great', diffMinutes: 2 });
    await store.addRecord({ ...sampleRecord, date: '2026-02-17', result: 'ok', diffMinutes: 8 });
    await store.addRecord({ ...sampleRecord, date: '2026-02-18', result: 'late', diffMinutes: 20 });

    const weekStart = new Date('2026-02-16');
    const stats = useWakeRecordStore.getState().getWeekStats(weekStart);
    expect(stats.totalRecords).toBe(3);
    expect(stats.successRate).toBeCloseTo(66.7, 0);
    expect(stats.averageDiffMinutes).toBe(10);
  });
});
