/**
 * AlarmSyncService の並行実行競合のテスト。
 *
 * syncAlarmsEffect は「キャンセル → 登録」の複合操作で、target 変更・cold-start・
 * セッション期限切れなど複数の経路から fire-and-forget で起動される。
 * 並行実行されても「ストアの alarmIds とネイティブ台帳が一致し、アラームが
 * 0 本にならない」ことを保証する。
 *
 * ネイティブ側はモック内の Set（台帳）で模倣する: schedule で追加・cancel で削除。
 * これにより「最終的に鳴るアラームが実在するか」を直接検証できる。
 */

import * as AlarmKit from 'expo-alarm-kit';
import { runEffect, syncAlarmsEffect } from '../services';
import { useMorningSessionStore } from '../stores/morning-session-store';
import { useSettingsStore } from '../stores/settings-store';
import { useWakeRecordStore } from '../stores/wake-record-store';
import { useWakeTargetStore } from '../stores/wake-target-store';
import type { WakeTarget } from '../types/wake-target';

const mockCancelAlarm = AlarmKit.cancelAlarm as jest.Mock;
const mockScheduleRepeatingAlarm = AlarmKit.scheduleRepeatingAlarm as jest.Mock;
const mockGetAllAlarms = AlarmKit.getAllAlarms as jest.Mock;
const mockGenerateUUID = AlarmKit.generateUUID as jest.Mock;

function createTarget(overrides?: Partial<WakeTarget>): WakeTarget {
  return {
    defaultTime: { hour: 7, minute: 0 },
    dayOverrides: {},
    nextOverride: null,
    todos: [],
    enabled: true,
    targetSleepMinutes: null,
    wakeUpGoalBufferMinutes: 30,
    ...overrides,
  };
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** マクロタスクを n 回消化する（並走中のもう一方の Effect を進めるため） */
async function flushMacrotasks(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await new Promise((r) => setImmediate(r));
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  useMorningSessionStore.setState({ session: null, loaded: true });
  useWakeRecordStore.setState({ records: [], loaded: true });
  useWakeTargetStore.setState({ target: null, loaded: false, alarmIds: [] });
  useSettingsStore.setState({ loaded: true });
});

describe('syncAlarmsEffect 並行実行', () => {
  test('並行 sync 後もストアの alarmIds とネイティブ台帳が一致し、アラームが 0 本にならない', async () => {
    // ネイティブ台帳を模倣
    const ledger = new Set<string>(['old-1']);
    let uuidCounter = 0;
    mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);
    mockGetAllAlarms.mockImplementation(() => [...ledger]);
    mockScheduleRepeatingAlarm.mockImplementation(async (params: { id: string }) => {
      ledger.add(params.id);
      return true;
    });

    // 1 回目の sync を旧アラームのキャンセル中に停止させ、その間に 2 回目を走らせる
    const gate = createDeferred();
    let gateArmed = true;
    mockCancelAlarm.mockImplementation(async (id: string) => {
      if (gateArmed && id === 'old-1') {
        gateArmed = false;
        await gate.promise;
      }
      ledger.delete(id);
      return true;
    });

    useWakeTargetStore.setState({ target: createTarget(), loaded: true, alarmIds: ['old-1'] });

    const syncA = runEffect(syncAlarmsEffect);
    // sync A が cancel('old-1') に到達して停止するまで待つ
    while (gateArmed) {
      await flushMacrotasks(1);
    }

    const syncB = runEffect(syncAlarmsEffect);
    // sync B を進める（直列化されていれば A の完了待ちで停止する）
    await flushMacrotasks(20);

    gate.resolve();
    await Promise.all([syncA, syncB]);

    const storeIds = useWakeTargetStore.getState().alarmIds;
    // 「設定画面では ON なのに 1 本も鳴らない」状態を禁止する
    expect(ledger.size).toBeGreaterThan(0);
    // ストアが把握している ID と実際に登録されている ID が一致する
    expect(new Set(storeIds)).toEqual(ledger);
  });

  test('逐次 2 回の sync でも最終的な store.alarmIds がネイティブ台帳と一致する', async () => {
    const ledger = new Set<string>();
    let uuidCounter = 0;
    mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);
    mockGetAllAlarms.mockImplementation(() => [...ledger]);
    mockScheduleRepeatingAlarm.mockImplementation(async (params: { id: string }) => {
      ledger.add(params.id);
      return true;
    });
    mockCancelAlarm.mockImplementation(async (id: string) => {
      ledger.delete(id);
      return true;
    });

    useWakeTargetStore.setState({ target: createTarget(), loaded: true, alarmIds: [] });
    await runEffect(syncAlarmsEffect);

    useWakeTargetStore.setState({
      target: createTarget({ defaultTime: { hour: 8, minute: 30 } }),
      loaded: true,
      alarmIds: [...useWakeTargetStore.getState().alarmIds],
    });
    await runEffect(syncAlarmsEffect);

    const storeIds = useWakeTargetStore.getState().alarmIds;
    expect(ledger.size).toBe(1);
    expect(new Set(storeIds)).toEqual(ledger);
  });
});
