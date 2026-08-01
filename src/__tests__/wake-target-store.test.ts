import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWakeTargetStore } from '../stores/wake-target-store';
import type { WakeTarget } from '../types/wake-target';
import {
  buildFixedSkyTodo,
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
    await useWakeTargetStore
      .getState()
      .setNextOverride({ hour: 5, minute: 30 }, new Date('2026-02-26'));
    const override = useWakeTargetStore.getState().target?.nextOverride;
    expect(override?.time).toEqual({ hour: 5, minute: 30 });
    expect(override?.targetDate).toBeDefined();
    await useWakeTargetStore.getState().clearNextOverride();
    expect(useWakeTargetStore.getState().target?.nextOverride).toBeNull();
  });

  test('setNextOverride は editDay の時刻がまだ来ていなければ editDay をそのまま対象日にする', async () => {
    jest.useFakeTimers({ now: new Date('2026-02-25T07:30:00') });
    try {
      await useWakeTargetStore.getState().setTarget(DEFAULT_WAKE_TARGET);
      // 8:00 は今日まだ来ていないが、editDay（翌日）が対象なので翌日 8:00 になる
      await useWakeTargetStore
        .getState()
        .setNextOverride({ hour: 8, minute: 0 }, new Date('2026-02-26'));
      expect(useWakeTargetStore.getState().target?.nextOverride?.targetDate).toBe('2026-02-26');
    } finally {
      jest.useRealTimers();
    }
  });

  test('setNextOverride は editDay の時刻が既に過去なら 1 日先送りする', async () => {
    // ピッカーが確定した editDay（当日）で選択時刻が既に過去（0:15 < now 0:30）の場合、
    // 即座に期限切れになる無効な override を作らないよう翌日に先送りする
    jest.useFakeTimers({ now: new Date('2026-02-25T00:30:00') });
    try {
      await useWakeTargetStore.getState().setTarget(DEFAULT_WAKE_TARGET);
      await useWakeTargetStore
        .getState()
        .setNextOverride({ hour: 0, minute: 15 }, new Date('2026-02-25'));
      expect(useWakeTargetStore.getState().target?.nextOverride?.targetDate).toBe('2026-02-26');
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

  test('setTaskType(sky) は taskType と todos を fixed sky todo に切り替えて永続化する', async () => {
    mockGetItem.mockResolvedValue(null);
    await useWakeTargetStore.getState().loadTarget();
    mockSetItem.mockClear();

    await useWakeTargetStore.getState().setTaskType('sky');

    const target = useWakeTargetStore.getState().target;
    expect(target?.taskType).toBe('sky');
    expect(target?.todos).toEqual([buildFixedSkyTodo()]);
    expect(mockSetItem).toHaveBeenCalledWith(
      'wake-target',
      expect.stringContaining('"taskType":"sky"'),
    );
  });

  test('setTaskType(squat) は sky から squat の fixed todo に戻す', async () => {
    mockGetItem.mockResolvedValue(null);
    await useWakeTargetStore.getState().loadTarget();
    await useWakeTargetStore.getState().setTaskType('sky');

    await useWakeTargetStore.getState().setTaskType('squat');

    const target = useWakeTargetStore.getState().target;
    expect(target?.taskType).toBe('squat');
    expect(target?.todos).toEqual([buildFixedSquatTodo()]);
  });

  test('setTaskType は target が null の場合は何もしない', async () => {
    await useWakeTargetStore.getState().setTaskType('sky');
    expect(useWakeTargetStore.getState().target).toBeNull();
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  test('loadTarget は保存済みの taskType: sky を復元する', async () => {
    const stored = { ...DEFAULT_WAKE_TARGET, taskType: 'sky', todos: [buildFixedSkyTodo()] };
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'wake-target') return Promise.resolve(JSON.stringify(stored));
      return Promise.resolve(null);
    });
    await useWakeTargetStore.getState().loadTarget();
    const target = useWakeTargetStore.getState().target;
    expect(target?.taskType).toBe('sky');
    expect(target?.todos).toEqual([buildFixedSkyTodo()]);
  });

  test('loadTarget は taskType 欠落（レガシーデータ）を squat にフォールバックする', async () => {
    const { taskType: _taskType, ...legacyStored } = DEFAULT_WAKE_TARGET as WakeTarget & {
      taskType?: string;
    };
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'wake-target') return Promise.resolve(JSON.stringify(legacyStored));
      return Promise.resolve(null);
    });
    await useWakeTargetStore.getState().loadTarget();
    expect(useWakeTargetStore.getState().target?.taskType).toBe('squat');
  });

  test('loadTarget は taskType の不正値を squat にフォールバックする', async () => {
    const stored = { ...DEFAULT_WAKE_TARGET, taskType: 'walk' };
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'wake-target') return Promise.resolve(JSON.stringify(stored));
      return Promise.resolve(null);
    });
    await useWakeTargetStore.getState().loadTarget();
    expect(useWakeTargetStore.getState().target?.taskType).toBe('squat');
  });

  test('loadTarget は taskType: sky なのに todos が squat の固定 todo のままなら fixed sky todo に正規化する', async () => {
    const stored = { ...DEFAULT_WAKE_TARGET, taskType: 'sky', todos: [buildFixedSquatTodo()] };
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'wake-target') return Promise.resolve(JSON.stringify(stored));
      return Promise.resolve(null);
    });
    await useWakeTargetStore.getState().loadTarget();
    const target = useWakeTargetStore.getState().target;
    expect(target?.taskType).toBe('sky');
    expect(target?.todos).toEqual([buildFixedSkyTodo()]);
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

  test('setWakeUpGoalBufferMinutes は範囲内の値をそのまま設定する', async () => {
    await useWakeTargetStore.getState().setTarget(DEFAULT_WAKE_TARGET);
    mockSetItem.mockClear();
    await useWakeTargetStore.getState().setWakeUpGoalBufferMinutes(45);
    expect(useWakeTargetStore.getState().target?.wakeUpGoalBufferMinutes).toBe(45);
    expect(mockSetItem).toHaveBeenCalledWith(
      'wake-target',
      expect.stringContaining('"wakeUpGoalBufferMinutes":45'),
    );
  });

  test('setWakeUpGoalBufferMinutes は下限未満・上限超過を範囲内にクランプする', async () => {
    await useWakeTargetStore.getState().setTarget(DEFAULT_WAKE_TARGET);
    await useWakeTargetStore.getState().setWakeUpGoalBufferMinutes(5);
    expect(useWakeTargetStore.getState().target?.wakeUpGoalBufferMinutes).toBe(10);
    await useWakeTargetStore.getState().setWakeUpGoalBufferMinutes(999);
    expect(useWakeTargetStore.getState().target?.wakeUpGoalBufferMinutes).toBe(120);
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

  test('loadTarget は範囲外の wakeUpGoalBufferMinutes を範囲内にクランプする', async () => {
    stubStoredTarget(JSON.stringify({ ...DEFAULT_WAKE_TARGET, wakeUpGoalBufferMinutes: 3 }));
    await useWakeTargetStore.getState().loadTarget();
    expect(useWakeTargetStore.getState().target?.wakeUpGoalBufferMinutes).toBe(10);

    stubStoredTarget(JSON.stringify({ ...DEFAULT_WAKE_TARGET, wakeUpGoalBufferMinutes: 999 }));
    await useWakeTargetStore.getState().loadTarget();
    expect(useWakeTargetStore.getState().target?.wakeUpGoalBufferMinutes).toBe(120);
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

  test('AsyncStorage.getItem が一時的に reject してもリトライで復旧し、実際の設定値を失わない', async () => {
    // 1回目は一時的な失敗、2回目で成功するケース。ここで即座に corrupted/デフォルト値に
    // 倒すと、実際にはストレージに残っている target を「存在しない」ものとして扱ってしまう
    let callCount = 0;
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'wake-target') {
        callCount += 1;
        if (callCount === 1) return Promise.reject(new Error('transient storage error'));
        return Promise.resolve(
          JSON.stringify({ defaultTime: { hour: 8, minute: 15 }, enabled: true }),
        );
      }
      return Promise.resolve(null);
    });
    await expect(useWakeTargetStore.getState().loadTarget()).resolves.toBeUndefined();
    const state = useWakeTargetStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.corrupted).toBe(false);
    expect(state.target?.defaultTime).toEqual({ hour: 8, minute: 15 });
  });

  test('AsyncStorage.getItem がリトライしても reject し続ける場合、loaded=false のまま留まる', async () => {
    // 読み取り自体が失敗し続ける場合、実際の target の有無が確認できていない。
    // loaded=true にすると syncAlarmsEffect が誤ったデフォルト/corrupted状態で
    // 走ってしまうため、loaded=false のまま留めて以降の再試行（アプリ再起動等）に委ねる
    mockGetItem.mockRejectedValue(new Error('storage unavailable'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(useWakeTargetStore.getState().loadTarget()).resolves.toBeUndefined();
    const state = useWakeTargetStore.getState();
    expect(state.loaded).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  test('loadTarget は破損 JSON では reject せず、target を確定できないため corrupted 状態にする', async () => {
    // raw が存在する（何か保存されていた）のに破損している場合、
    // loaded=true で捏造した DEFAULT_WAKE_TARGET を確定させると、
    // 次の syncAlarmsEffect が alarmIds（実在するネイティブアラーム）を
    // previousIds として使い、7:00 のデフォルトアラームを新規登録した上で
    // ユーザーの実際の設定に基づく旧アラームをキャンセルしてしまう。
    // target が確定するまで同期させないほうが安全。
    // 一方で loaded=false のまま放置すると、ダッシュボードがローディング画面に
    // 固まり続け、resetCorruptedTarget によるユーザーの復旧手段にも到達できない。
    // loaded=true・corrupted=true にして、画面遷移と復旧導線の両方を確保する
    stubStoredTarget('not-json{{{');
    await expect(useWakeTargetStore.getState().loadTarget()).resolves.toBeUndefined();
    const state = useWakeTargetStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.corrupted).toBe(true);
    expect(state.target).toBeNull();
  });

  test('loadTarget は文字列 "null" が保存されていても corrupted 状態にする', async () => {
    stubStoredTarget('null');
    await useWakeTargetStore.getState().loadTarget();
    const state = useWakeTargetStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.corrupted).toBe(true);
    expect(state.target).toBeNull();
  });

  test('loadTarget は破損 JSON でも alarmIds が読めていればストアに反映する（次回再試行時のため）', async () => {
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'wake-target') return Promise.resolve('not-json{{{');
      if (key === 'alarm-ids') return Promise.resolve(JSON.stringify(['native-1', 'native-2']));
      return Promise.resolve(null);
    });
    await useWakeTargetStore.getState().loadTarget();
    const state = useWakeTargetStore.getState();
    expect(state.corrupted).toBe(true);
    expect(state.alarmIds).toEqual(['native-1', 'native-2']);
  });

  test('resetCorruptedTarget は corrupted を解除し、無効化した DEFAULT_WAKE_TARGET を保存する', async () => {
    stubStoredTarget('not-json{{{');
    await useWakeTargetStore.getState().loadTarget();
    expect(useWakeTargetStore.getState().corrupted).toBe(true);

    await useWakeTargetStore.getState().resetCorruptedTarget();

    const state = useWakeTargetStore.getState();
    expect(state.corrupted).toBe(false);
    expect(state.target).toEqual({ ...DEFAULT_WAKE_TARGET, enabled: false });
    expect(mockSetItem).toHaveBeenCalledWith(
      'wake-target',
      JSON.stringify({ ...DEFAULT_WAKE_TARGET, enabled: false }),
    );
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
