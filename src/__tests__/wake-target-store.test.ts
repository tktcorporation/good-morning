import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettingsStore } from '../stores/settings-store';
import { useWakeTargetStore } from '../stores/wake-target-store';
import type { WakeTarget } from '../types/wake-target';
import {
  buildFixedSquatTodo,
  DEFAULT_WAKE_TARGET,
  FIXED_SQUAT_REQUIRED_COUNT,
  FIXED_SQUAT_TODO_ID,
} from '../types/wake-target';

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

  test('setNextOverride sets with targetDate and clearNextOverride clears', async () => {
    await useWakeTargetStore.getState().setTarget(DEFAULT_WAKE_TARGET);
    await useWakeTargetStore.getState().setNextOverride({ hour: 5, minute: 30 });
    const override = useWakeTargetStore.getState().target?.nextOverride;
    expect(override?.time).toEqual({ hour: 5, minute: 30 });
    expect(override?.targetDate).toBeDefined();
    await useWakeTargetStore.getState().clearNextOverride();
    expect(useWakeTargetStore.getState().target?.nextOverride).toBeNull();
  });

  test('setNextOverride は「明日だけ」— 朝に設定しても対象日は翌日になる', async () => {
    jest.useFakeTimers({ now: new Date('2026-02-25T07:30:00') });
    try {
      useSettingsStore.setState({ dayBoundaryHour: 4 });
      await useWakeTargetStore.getState().setTarget(DEFAULT_WAKE_TARGET);
      // 8:00 は今日まだ来ていないが、「明日だけ 8:00」なので対象は翌日
      await useWakeTargetStore.getState().setNextOverride({ hour: 8, minute: 0 });
      expect(useWakeTargetStore.getState().target?.nextOverride?.targetDate).toBe('2026-02-26');
    } finally {
      jest.useRealTimers();
    }
  });

  test('setNextOverride は日付変更ライン前の深夜なら当日（今夜の起床）を対象日にする', async () => {
    jest.useFakeTimers({ now: new Date('2026-02-25T00:30:00') });
    try {
      useSettingsStore.setState({ dayBoundaryHour: 4 });
      await useWakeTargetStore.getState().setTarget(DEFAULT_WAKE_TARGET);
      await useWakeTargetStore.getState().setNextOverride({ hour: 7, minute: 0 });
      expect(useWakeTargetStore.getState().target?.nextOverride?.targetDate).toBe('2026-02-25');
    } finally {
      jest.useRealTimers();
    }
  });

  test('loadTarget preserves expired nextOverride (cleared by clearExpiredOverride instead)', async () => {
    const stored: WakeTarget = {
      ...DEFAULT_WAKE_TARGET,
      nextOverride: { time: { hour: 7, minute: 0 }, targetDate: '2020-01-01' },
    };
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'wake-target') return Promise.resolve(JSON.stringify(stored));
      return Promise.resolve(null);
    });
    await useWakeTargetStore.getState().loadTarget();
    // loadTarget は期限切れの override をクリアしない（clearExpiredOverride で明示的にクリアする）
    expect(useWakeTargetStore.getState().target?.nextOverride).toEqual({
      time: { hour: 7, minute: 0 },
      targetDate: '2020-01-01',
    });
  });

  test('clearExpiredOverride clears expired nextOverride', async () => {
    const stored: WakeTarget = {
      ...DEFAULT_WAKE_TARGET,
      nextOverride: { time: { hour: 7, minute: 0 }, targetDate: '2020-01-01' },
    };
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'wake-target') return Promise.resolve(JSON.stringify(stored));
      return Promise.resolve(null);
    });
    await useWakeTargetStore.getState().loadTarget();
    await useWakeTargetStore.getState().clearExpiredOverride();
    expect(useWakeTargetStore.getState().target?.nextOverride).toBeNull();
    expect(mockSetItem).toHaveBeenCalledWith(
      'wake-target',
      expect.stringContaining('"nextOverride":null'),
    );
  });

  test('clearExpiredOverride clears legacy nextOverride without targetDate', async () => {
    const stored = {
      ...DEFAULT_WAKE_TARGET,
      nextOverride: { time: { hour: 7, minute: 0 } },
    };
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'wake-target') return Promise.resolve(JSON.stringify(stored));
      return Promise.resolve(null);
    });
    await useWakeTargetStore.getState().loadTarget();
    await useWakeTargetStore.getState().clearExpiredOverride();
    expect(useWakeTargetStore.getState().target?.nextOverride).toBeNull();
  });

  test('setDayOverride and removeDayOverride', async () => {
    await useWakeTargetStore.getState().setTarget(DEFAULT_WAKE_TARGET);
    await useWakeTargetStore.getState().setDayOverride(0, { type: 'off' });
    expect(useWakeTargetStore.getState().target?.dayOverrides[0]).toEqual({ type: 'off' });
    await useWakeTargetStore.getState().removeDayOverride(0);
    expect(useWakeTargetStore.getState().target?.dayOverrides[0]).toBeUndefined();
  });

  test('toggleEnabled flips the enabled flag', async () => {
    await useWakeTargetStore.getState().setTarget(DEFAULT_WAKE_TARGET);
    expect(useWakeTargetStore.getState().target?.enabled).toBe(true);
    await useWakeTargetStore.getState().toggleEnabled();
    expect(useWakeTargetStore.getState().target?.enabled).toBe(false);
  });

  test('DEFAULT_WAKE_TARGET contains exactly the fixed squat todo', () => {
    expect(DEFAULT_WAKE_TARGET.todos).toHaveLength(1);
    const only = DEFAULT_WAKE_TARGET.todos[0];
    expect(only?.id).toBe(FIXED_SQUAT_TODO_ID);
    expect(only?.type).toBe('squat');
    expect(only?.requiredCount).toBe(FIXED_SQUAT_REQUIRED_COUNT);
  });

  test('loadTarget injects fixed squat todo when stored data has empty todos', async () => {
    const stored = { ...DEFAULT_WAKE_TARGET, todos: [] };
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'wake-target') return Promise.resolve(JSON.stringify(stored));
      return Promise.resolve(null);
    });
    await useWakeTargetStore.getState().loadTarget();
    const todos = useWakeTargetStore.getState().target?.todos ?? [];
    expect(todos).toHaveLength(1);
    expect(todos[0]?.id).toBe(FIXED_SQUAT_TODO_ID);
  });

  test('loadTarget normalizes legacy free-form todos to fixed squat', async () => {
    const stored = {
      ...DEFAULT_WAKE_TARGET,
      todos: [
        { id: 'legacy-1', title: 'Drink water', completed: false },
        { id: 'legacy-2', title: 'Stretch', completed: false },
      ],
    };
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'wake-target') return Promise.resolve(JSON.stringify(stored));
      return Promise.resolve(null);
    });
    await useWakeTargetStore.getState().loadTarget();
    const todos = useWakeTargetStore.getState().target?.todos ?? [];
    expect(todos).toEqual([buildFixedSquatTodo()]);
  });

  test('loadTarget preserves stored todos when already the fixed squat', async () => {
    const fixedTodo = buildFixedSquatTodo();
    const stored = { ...DEFAULT_WAKE_TARGET, todos: [fixedTodo] };
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'wake-target') return Promise.resolve(JSON.stringify(stored));
      return Promise.resolve(null);
    });
    await useWakeTargetStore.getState().loadTarget();
    expect(useWakeTargetStore.getState().target?.todos).toEqual([fixedTodo]);
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

  test('setTargetSleepMinutes sets and persists', async () => {
    await useWakeTargetStore.getState().setTarget(DEFAULT_WAKE_TARGET);
    mockSetItem.mockClear();
    await useWakeTargetStore.getState().setTargetSleepMinutes(420);
    expect(useWakeTargetStore.getState().target?.targetSleepMinutes).toBe(420);
    expect(mockSetItem).toHaveBeenCalledWith(
      'wake-target',
      expect.stringContaining('"targetSleepMinutes":420'),
    );
  });

  test('setTargetSleepMinutes(null) clears', async () => {
    await useWakeTargetStore.getState().setTarget({
      ...DEFAULT_WAKE_TARGET,
      targetSleepMinutes: 420,
    });
    mockSetItem.mockClear();
    await useWakeTargetStore.getState().setTargetSleepMinutes(null);
    expect(useWakeTargetStore.getState().target?.targetSleepMinutes).toBeNull();
  });

  test('loadTarget migrates legacy bedtimeTarget to targetSleepMinutes', async () => {
    const legacyTarget = {
      defaultTime: { hour: 6, minute: 0 },
      dayOverrides: {},
      nextOverride: null,
      todos: [],
      enabled: true,
      bedtimeTarget: { hour: 23, minute: 0 },
    };
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'wake-target') return Promise.resolve(JSON.stringify(legacyTarget));
      return Promise.resolve(null);
    });
    await useWakeTargetStore.getState().loadTarget();
    expect(useWakeTargetStore.getState().target?.targetSleepMinutes).toBe(420);
  });

  test('loadTarget handles legacy data without bedtimeTarget or targetSleepMinutes', async () => {
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
    expect(useWakeTargetStore.getState().target?.targetSleepMinutes).toBeNull();
  });

  // ─── マイグレーション正規化（欠落・破損フィールドでスケジューリングを例外死させない） ───

  function stubStoredTarget(value: string): void {
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'wake-target') return Promise.resolve(value);
      return Promise.resolve(null);
    });
  }

  test('loadTarget は dayOverrides / nextOverride 欠落のレガシーデータを {} / null に正規化する', async () => {
    // dayOverrides が undefined のままだと groupDaysByTime が TypeError で死に、
    // 旧アラーム全キャンセル後にスケジュール 0 本で終わる（アラームが鳴らなくなる）
    stubStoredTarget(JSON.stringify({ defaultTime: { hour: 7, minute: 0 }, enabled: true }));
    await useWakeTargetStore.getState().loadTarget();
    const target = useWakeTargetStore.getState().target;
    expect(target?.dayOverrides).toEqual({});
    expect(target?.nextOverride).toBeNull();
  });

  test('loadTarget は enabled 欠落を true に正規化する（保存済みデータの持ち主は利用継続中のため）', async () => {
    stubStoredTarget(JSON.stringify({ defaultTime: { hour: 7, minute: 0 } }));
    await useWakeTargetStore.getState().loadTarget();
    expect(useWakeTargetStore.getState().target?.enabled).toBe(true);
  });

  test('loadTarget は defaultTime 欠落・不正値をデフォルト時刻に正規化する', async () => {
    stubStoredTarget(JSON.stringify({ enabled: true }));
    await useWakeTargetStore.getState().loadTarget();
    expect(useWakeTargetStore.getState().target?.defaultTime).toEqual(
      DEFAULT_WAKE_TARGET.defaultTime,
    );

    stubStoredTarget(JSON.stringify({ defaultTime: { hour: 99, minute: -5 }, enabled: true }));
    await useWakeTargetStore.getState().loadTarget();
    expect(useWakeTargetStore.getState().target?.defaultTime).toEqual(
      DEFAULT_WAKE_TARGET.defaultTime,
    );
  });

  test('loadTarget は time 欠損の破損 nextOverride を null に正規化する', async () => {
    stubStoredTarget(
      JSON.stringify({
        ...DEFAULT_WAKE_TARGET,
        nextOverride: { targetDate: '2026-03-01' },
      }),
    );
    await useWakeTargetStore.getState().loadTarget();
    expect(useWakeTargetStore.getState().target?.nextOverride).toBeNull();
  });

  test('loadTarget は不正な dayOverrides エントリを捨てて有効なものだけ残す', async () => {
    stubStoredTarget(
      JSON.stringify({
        ...DEFAULT_WAKE_TARGET,
        dayOverrides: {
          0: { type: 'off' },
          1: { type: 'custom', time: { hour: 6, minute: 30 } },
          2: { type: 'custom' },
          3: { type: 'unknown' },
        },
      }),
    );
    await useWakeTargetStore.getState().loadTarget();
    expect(useWakeTargetStore.getState().target?.dayOverrides).toEqual({
      0: { type: 'off' },
      1: { type: 'custom', time: { hour: 6, minute: 30 } },
    });
  });

  test('loadTarget は破損 JSON でも reject せず loaded=true になり、enabled は維持される', async () => {
    // raw が存在する（何か保存されていた）のに破損している場合は
    // 「未設定」ではなく「利用中ユーザーの一時的な読み取り失敗」の可能性が高い。
    // enabled: false に倒すと、次の syncAlarmsEffect が登録済みの
    // ネイティブアラームを本人の意図なく全キャンセルしてしまう
    stubStoredTarget('not-json{{{');
    await expect(useWakeTargetStore.getState().loadTarget()).resolves.toBeUndefined();
    const state = useWakeTargetStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.target).toEqual(DEFAULT_WAKE_TARGET);
    expect(state.target?.enabled).toBe(true);
  });

  test('loadTarget は文字列 "null" が保存されていても enabled を維持してフォールバックする', async () => {
    stubStoredTarget('null');
    await useWakeTargetStore.getState().loadTarget();
    const state = useWakeTargetStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.target).toEqual(DEFAULT_WAKE_TARGET);
  });

  test('loadTarget は未設定（初回起動）のみ enabled: false にフォールバックする', async () => {
    mockGetItem.mockResolvedValue(null);
    await useWakeTargetStore.getState().loadTarget();
    const state = useWakeTargetStore.getState();
    expect(state.target).toEqual({ ...DEFAULT_WAKE_TARGET, enabled: false });
  });

  test('loadTarget は alarm-ids が破損していても target のロードに成功し alarmIds は [] になる', async () => {
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'wake-target') return Promise.resolve(JSON.stringify(DEFAULT_WAKE_TARGET));
      if (key === 'alarm-ids') return Promise.resolve('broken[[[');
      return Promise.resolve(null);
    });
    await useWakeTargetStore.getState().loadTarget();
    const state = useWakeTargetStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.target).not.toBeNull();
    expect(state.alarmIds).toEqual([]);
  });
});
