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
  test('AsyncStorage.getItem が一時的に reject してもリトライで復旧し、実データを失わない', async () => {
    // 1回目は一時的な失敗、2回目で成功するケース。ここで即座に records=[] に
    // 倒すと、実際にはストレージに残っている履歴を「存在しない」ものとして
    // 扱ってしまい、後続の addRecord で上書き消失する
    mockGetItem
      .mockRejectedValueOnce(new Error('transient storage error'))
      .mockResolvedValueOnce(JSON.stringify([{ ...sampleRecord, id: 'existing-1' }]));
    await expect(useWakeRecordStore.getState().loadRecords()).resolves.toBeUndefined();
    const state = useWakeRecordStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.records).toHaveLength(1);
    expect(state.records[0]?.id).toBe('existing-1');
  });

  test('AsyncStorage.getItem がリトライしても reject し続ける場合、loaded=false のまま留まり既存データを破棄しない', async () => {
    // 読み取り自体が失敗し続ける場合、ストレージ上の実データの有無が
    // 確認できていない。loaded=true・records=[] にすると、次の addRecord が
    // 空配列を実データの上に永続化し既存の起床履歴を消してしまうため、
    // loaded=false のまま留めて以降の再試行（アプリ再起動等）に委ねる
    // StorageService の読み取りリトライ回数（3回）分だけ reject を積む。
    // mockRejectedValue（永続）だと以降のテストにもモックが漏れ出すため使わない
    mockGetItem
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockRejectedValueOnce(new Error('storage unavailable'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(useWakeRecordStore.getState().loadRecords()).resolves.toBeUndefined();
    const state = useWakeRecordStore.getState();
    expect(state.loaded).toBe(false);
    expect(state.records).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  test('破損 JSON では reject せず loaded=true・records=[] で確定する（データは読めたが復元不能なため）', async () => {
    mockGetItem.mockResolvedValueOnce('not-json{{{');
    await expect(useWakeRecordStore.getState().loadRecords()).resolves.toBeUndefined();
    const state = useWakeRecordStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.records).toEqual([]);
  });

  test('トップレベルが配列でない場合は loaded=true・records=[] で確定する', async () => {
    mockGetItem.mockResolvedValueOnce(JSON.stringify({ not: 'an array' }));
    await expect(useWakeRecordStore.getState().loadRecords()).resolves.toBeUndefined();
    const state = useWakeRecordStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.records).toEqual([]);
  });

  test('配列内の1件が不正な形状でも、正常なレコードは失わず不正な要素だけをスキップする', async () => {
    const valid = { ...sampleRecord, id: 'valid-1' };
    const malformed = { id: 'broken-1', date: '2026-02-23' }; // 必須フィールド欠落
    mockGetItem.mockResolvedValueOnce(JSON.stringify([valid, malformed]));
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(useWakeRecordStore.getState().loadRecords()).resolves.toBeUndefined();

    const state = useWakeRecordStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.records).toHaveLength(1);
    expect(state.records[0]?.id).toBe('valid-1');
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });
});
