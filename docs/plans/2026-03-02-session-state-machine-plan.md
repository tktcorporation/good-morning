# Session State Machine Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** セッション管理を明示的ステートマシンに再設計し、全 state を永続化、アラーム名前空間を分離して4つの根本問題を解決する

**Architecture:** `MorningSession` に `snoozeAlarmIds` / `snoozeFiresAt` を含めて全 state を AsyncStorage に永続化する。`cancelAlarmsByIds()` でアラーム種別ごとの選択的キャンセルを可能にし、`cancelAllAlarms()` の無差別キャンセルを排除する。`session-lifecycle.ts` に全遷移ロジックを集約し、コンポーネントは1行呼び出しに簡素化する。

**Tech Stack:** TypeScript, Zustand, Jest, expo-alarm-kit, AsyncStorage

**Design doc:** `docs/plans/2026-03-01-session-lifecycle-service-design.md`（基盤設計。本プランはこれを拡張する）

**前プランとの差分:**
- `snoozeAlarmIds` / `snoozeFiresAt` を MorningSession に永続化（`restoreSnoozeCountdown()` 不要に）
- `cancelAlarmsByIds()` でアラーム名前空間を分離（`cancelAllAlarms()` 排除）
- `scheduleWakeTargetAlarm()` が前回の wake-target ID のみキャンセル（スヌーズ巻き添え防止）

---

### Task 1: MorningSession 型に snooze state を追加

**Files:**
- Modify: `src/types/morning-session.ts:18-37`

**Step 1: Update MorningSession interface**

`src/types/morning-session.ts` の `MorningSession` に2フィールド追加:

```typescript
export interface MorningSession {
  readonly recordId: string;
  readonly date: string;
  readonly startedAt: string;
  readonly todos: readonly SessionTodo[];
  readonly liveActivityId: string | null;
  readonly goalDeadline: string | null;
  /**
   * 先行スケジュール済みスヌーズの AlarmKit ID 配列。
   * TODO全完了時に cancelAlarmsByIds() で残りをキャンセルする。
   * 従来はメモリのみだったが、アプリ kill → 再起動後も ID ベースキャンセルを
   * 可能にするため MorningSession に含めて永続化する。
   */
  readonly snoozeAlarmIds: readonly string[];
  /**
   * 次のスヌーズ発火予定時刻（ISO文字列）。カウントダウン表示に使用。
   * 従来はメモリのみで restoreSnoozeCountdown() による逆算が必要だったが、
   * 永続化により再起動後もそのまま読み込める。
   */
  readonly snoozeFiresAt: string | null;
}
```

**Step 2: Run typecheck to see expected failures**

Run: `pnpm typecheck`
Expected: FAIL — `startSession` 呼び出し箇所で新フィールドが不足

**Step 3: Commit**

```bash
jj commit -m "types: MorningSession に snoozeAlarmIds/snoozeFiresAt を追加

WHY: メモリのみだった snooze state を永続化し、アプリ kill 後も
ID ベースのアラームキャンセルとカウントダウン復元を可能にする。
restoreSnoozeCountdown() の逆算ロジックが不要になる。"
```

---

### Task 2: morning-session-store の永続化対応 + マイグレーション

**Files:**
- Modify: `src/stores/morning-session-store.ts`
- Modify: `src/__tests__/morning-session-store.test.ts`

**Step 1: Write failing test for migration**

`src/__tests__/morning-session-store.test.ts` の `describe('live activity state')` の後に追加:

```typescript
describe('snooze state persistence', () => {
  it('migrates snoozeAlarmIds to empty array when loading legacy data without the field', async () => {
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
    const state = useMorningSessionStore.getState();
    expect(state.session).not.toBeNull();
    expect(state.session?.snoozeAlarmIds).toEqual([]);
    expect(state.session?.snoozeFiresAt).toBeNull();
  });

  it('persists snoozeAlarmIds and snoozeFiresAt in session', async () => {
    await useMorningSessionStore
      .getState()
      .startSession('wake_123', '2026-02-22', sampleTodos, null);
    await useMorningSessionStore
      .getState()
      .setSnoozeState(['snooze-1', 'snooze-2'], '2026-02-22T07:09:00.000Z');

    // リロードして永続化を確認
    useMorningSessionStore.setState({ session: null, loaded: false });
    await useMorningSessionStore.getState().loadSession();

    const state = useMorningSessionStore.getState();
    expect(state.session?.snoozeAlarmIds).toEqual(['snooze-1', 'snooze-2']);
    expect(state.session?.snoozeFiresAt).toBe('2026-02-22T07:09:00.000Z');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --testPathPattern=morning-session-store`
Expected: FAIL — `setSnoozeState` is not a function, migration not implemented

**Step 3: Update morning-session-store.ts**

Changes:
1. `startSession` — 新フィールドを初期値で含める
2. `loadSession` — マイグレーションに `snoozeAlarmIds` / `snoozeFiresAt` を追加
3. `setSnoozeAlarmIds` / `setSnoozeFiresAt` — session 内のフィールドを更新 + 永続化
4. `setSnoozeState` — 両方を一括更新 + 永続化（アトミック操作）
5. `clearSession` — store レベルの `snoozeAlarmIds` / `snoozeFiresAt` は削除（session 内に統合済み）

```typescript
// startSession 内:
const session: MorningSession = {
  recordId,
  date,
  startedAt: new Date().toISOString(),
  todos,
  liveActivityId: null,
  goalDeadline,
  snoozeAlarmIds: [],
  snoozeFiresAt: null,
};

// loadSession 内のマイグレーション:
set({
  session: {
    ...parsed,
    liveActivityId: parsed.liveActivityId ?? null,
    goalDeadline: parsed.goalDeadline ?? null,
    snoozeAlarmIds: parsed.snoozeAlarmIds ?? [],
    snoozeFiresAt: parsed.snoozeFiresAt ?? null,
  },
  loaded: true,
});

// 新しい setSnoozeState アクション:
setSnoozeState: async (ids: readonly string[], firesAt: string | null) => {
  const { session } = get();
  if (session === null) return;
  const updated: MorningSession = {
    ...session,
    snoozeAlarmIds: ids,
    snoozeFiresAt: firesAt,
  };
  set({ session: updated });
  await persistSession(updated);
},

// setSnoozeFiresAt を session 内フィールド更新に変更:
setSnoozeFiresAt: async (time: string | null) => {
  const { session } = get();
  if (session === null) return;
  const updated: MorningSession = { ...session, snoozeFiresAt: time };
  set({ session: updated });
  await persistSession(updated);
},

// clearSession: store レベルの snooze state を削除
clearSession: async () => {
  set({ session: null });
  await persistSession(null);
  syncWidget().catch(() => {});
},
```

**重要:** `MorningSessionState` インターフェースから `snoozeAlarmIds` と `snoozeFiresAt` を store レベルフィールドとして削除し、`session.snoozeAlarmIds` / `session.snoozeFiresAt` に一本化する。ただし、UI コンポーネント (`index.tsx`) が `useMorningSessionStore((s) => s.snoozeFiresAt)` で購読しているため、store レベルに derived getter を残すか、コンポーネント側を `session?.snoozeFiresAt` に変更する。

→ コンポーネント側を変更する（Task 9 で実施）。store レベルフィールドは削除。

**Step 4: Run tests to verify they pass**

Run: `pnpm test -- --testPathPattern=morning-session-store`
Expected: PASS

**Step 5: Commit**

```bash
jj commit -m "feat: snooze state を MorningSession に永続化

WHY: メモリのみだった snoozeAlarmIds/snoozeFiresAt を session 内に移動し
AsyncStorage に永続化。アプリ kill 後もカウントダウン表示と ID ベース
キャンセルが可能になる。restoreSnoozeCountdown() が不要に。"
```

---

### Task 3: alarm-kit.ts — cancelAlarmsByIds 追加

**Files:**
- Modify: `src/services/alarm-kit.ts`
- Modify: `src/__tests__/alarm-kit.test.ts`

**Step 1: Write failing test**

`src/__tests__/alarm-kit.test.ts` に追加:

```typescript
describe('cancelAlarmsByIds', () => {
  it('cancels only specified alarm IDs', async () => {
    const { cancelAlarmsByIds } = require('../services/alarm-kit');
    await cancelAlarmsByIds(['alarm-1', 'alarm-3']);

    const kit = require('expo-alarm-kit');
    expect(kit.cancelAlarm).toHaveBeenCalledTimes(2);
    expect(kit.cancelAlarm).toHaveBeenCalledWith('alarm-1');
    expect(kit.cancelAlarm).toHaveBeenCalledWith('alarm-3');
  });

  it('does nothing when ids array is empty', async () => {
    const { cancelAlarmsByIds } = require('../services/alarm-kit');
    await cancelAlarmsByIds([]);

    const kit = require('expo-alarm-kit');
    expect(kit.cancelAlarm).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --testPathPattern=alarm-kit`
Expected: FAIL — `cancelAlarmsByIds` is not a function

**Step 3: Add cancelAlarmsByIds to alarm-kit.ts**

`cancelAllAlarms` の後に追加:

```typescript
/**
 * 指定された AlarmKit ID のアラームのみをキャンセルする。
 *
 * 背景: cancelAllAlarms() は全アラームを無差別にキャンセルするため、
 * スヌーズアラームとウェイクターゲットアラームを区別できなかった。
 * snoozeAlarmIds を永続化したことで、種別ごとの選択的キャンセルが可能になった。
 *
 * 用途:
 *   - completeMorningSession(): snoozeAlarmIds のみキャンセル
 *   - scheduleWakeTargetAlarm(): 前回の wake-target ID のみキャンセル
 */
export async function cancelAlarmsByIds(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const kit = getAlarmKit();
  if (kit === null) return;
  await Promise.all(ids.map((id) => kit.cancelAlarm(id)));
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --testPathPattern=alarm-kit`
Expected: PASS

**Step 5: Commit**

```bash
jj commit -m "feat: cancelAlarmsByIds を追加

WHY: cancelAllAlarms() の代わりに種別ごとの選択的キャンセルを可能にする。
スヌーズとウェイクターゲットのアラーム ID を区別してキャンセルすることで、
スヌーズが巻き添えでキャンセルされる問題を根本解決する。"
```

---

### Task 4: scheduleWakeTargetAlarm — 名前空間分離

**Files:**
- Modify: `src/services/alarm-kit.ts:94-146` (`scheduleWakeTargetAlarm`)
- Modify: `src/__tests__/alarm-kit.test.ts`

**Step 1: Write failing test**

```typescript
describe('scheduleWakeTargetAlarm with previousIds', () => {
  it('cancels only previous wake-target IDs instead of all alarms', async () => {
    const { scheduleWakeTargetAlarm, cancelAlarmsByIds } = require('../services/alarm-kit');
    const kit = require('expo-alarm-kit');

    // scheduleWakeTargetAlarm の内部で cancelAlarmsByIds が呼ばれることを確認
    const target = {
      defaultTime: { hour: 7, minute: 0 },
      dayOverrides: {},
      nextOverride: null,
      todos: [],
      enabled: true,
      soundId: 'default',
      targetSleepMinutes: null,
      wakeUpGoalBufferMinutes: 30,
    };

    await scheduleWakeTargetAlarm(target, ['old-wake-1', 'old-wake-2']);

    // cancelAllAlarms は呼ばれない
    expect(kit.getAllAlarms).not.toHaveBeenCalled();
    // cancelAlarmsByIds で前回の ID のみキャンセル
    expect(kit.cancelAlarm).toHaveBeenCalledWith('old-wake-1');
    expect(kit.cancelAlarm).toHaveBeenCalledWith('old-wake-2');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --testPathPattern=alarm-kit`
Expected: FAIL — 旧コードは cancelAllAlarms → getAllAlarms を呼ぶ

**Step 3: Modify scheduleWakeTargetAlarm signature**

```typescript
/**
 * WakeTarget の設定に基づいてアラームをスケジュールする。
 *
 * @param target アラーム設定
 * @param previousIds 前回スケジュールした wake-target アラーム ID。これらのみキャンセルする。
 *                    空配列の場合はキャンセルせずに新規スケジュールのみ行う。
 */
export async function scheduleWakeTargetAlarm(
  target: WakeTarget,
  previousIds: readonly string[] = [],
): Promise<readonly string[]> {
  // Cancel only previous wake-target alarms (not snooze alarms)
  await cancelAlarmsByIds(previousIds);

  const kit = getAlarmKit();
  if (kit === null || !target.enabled) return [];

  // ... rest unchanged ...
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test -- --testPathPattern=alarm-kit`
Expected: PASS

**Note:** 既存の呼び出し元 (`_layout.tsx`) は `previousIds` を渡さない（デフォルト `[]`）ため、後方互換性がある。Task 10 で `_layout.tsx` を更新して `alarmIds` を渡すようにする。

**Step 5: Commit**

```bash
jj commit -m "refactor: scheduleWakeTargetAlarm が前回 ID のみキャンセルする方式に変更

WHY: cancelAllAlarms() の代わりに previousIds のみキャンセルすることで、
アクティブなスヌーズアラームが巻き添えでキャンセルされる問題を防ぐ。
デフォルト引数により既存の呼び出し元との後方互換性を維持。"
```

---

### Task 5: session-lifecycle.ts スケルトン作成

snooze.ts から関数を移動し、新関数のスタブを追加する。

**Files:**
- Create: `src/services/session-lifecycle.ts`

**Step 1: Create session-lifecycle.ts**

```typescript
/**
 * セッションのライフサイクル操作を一元管理するオーケストレーション層。
 *
 * 背景: セッション操作が wakeup.tsx（開始）→ index.tsx（完了）→ _layout.tsx（復元）に
 * 散在していたため、全操作をこのモジュールに集約した。各関数が alarm-kit, stores を
 * 協調させ、コンポーネントは1行の呼び出しで済む。
 *
 * 設計: docs/plans/2026-03-01-session-lifecycle-service-design.md
 * 拡張: docs/plans/2026-03-02-session-state-machine-plan.md
 */

import type { AlarmTime } from '../types/alarm';
import type { MorningSession, SessionTodo } from '../types/morning-session';
import type { WakeTodoRecord } from '../types/wake-record';
import type { WakeTarget } from '../types/wake-target';
import {
  SNOOZE_DURATION_SECONDS,
  cancelAlarmsByIds,
  endLiveActivity,
  scheduleSnoozeAlarms,
  scheduleWakeTargetAlarm,
  startLiveActivity,
  updateLiveActivity,
} from './alarm-kit';
import { useMorningSessionStore } from '../stores/morning-session-store';
import { useWakeRecordStore } from '../stores/wake-record-store';
import { useWakeTargetStore } from '../stores/wake-target-store';
import { calculateDiffMinutes, calculateWakeResult } from '../types/wake-record';
import { getLogicalDateString } from '../utils/date';

// ── handleSnoozeArrival (moved from snooze.ts) ──────────────────────

/**
 * スヌーズアラーム発火時の処理。再スケジュールは不要（先行スケジュール済み）。
 * Live Activity のカウントダウンを次のスヌーズ時刻に更新する。
 *
 * 呼び出し元: app/_layout.tsx（スヌーズ再発火時）
 *
 * @returns true if session is active with incomplete todos
 */
export function handleSnoozeArrival(): boolean {
  const state = useMorningSessionStore.getState();
  if (state.session === null || state.areAllCompleted()) {
    return false;
  }

  const nextSnoozeFiresAt = new Date(Date.now() + SNOOZE_DURATION_SECONDS * 1000).toISOString();
  // snoozeFiresAt を session 内に永続化更新
  state.setSnoozeFiresAt(nextSnoozeFiresAt);

  const activityId = state.session.liveActivityId;
  if (activityId !== null) {
    updateLiveActivity(
      activityId,
      state.session.todos.map((t) => ({
        id: t.id,
        title: t.title,
        completed: t.completed,
      })),
      nextSnoozeFiresAt,
    );
  }
  return true;
}

// ── Stubs (Task 6-8 で TDD 実装) ────────────────────────────────────

export interface StartSessionParams {
  readonly target: WakeTarget;
  readonly resolvedTime: AlarmTime;
  readonly dismissTime: Date;
  readonly mountedAt: Date;
  readonly dayBoundaryHour: number;
}

/**
 * セッション開始: record作成 → session作成 → snoozeスケジュール → Live Activity開始。
 */
export async function startMorningSession(_params: StartSessionParams): Promise<void> {
  throw new Error('Not implemented');
}

/**
 * セッション完了: cancelSnoozeAlarms → endLA → updateRecord → clearSession → reschedule。
 */
export async function completeMorningSession(_session: MorningSession): Promise<void> {
  throw new Error('Not implemented');
}

/**
 * アプリ通常起動時のセッション復元・クリーンアップ。
 * snoozeFiresAt は永続化済みのため restoreSnoozeCountdown() は不要。
 */
export function restoreSessionOnLaunch(_dayBoundaryHour: number): void {
  throw new Error('Not implemented');
}
```

**Step 2: Run existing snooze tests (should still pass — snooze.ts still exists)**

Run: `pnpm test -- --testPathPattern=snooze`
Expected: PASS

**Step 3: Commit**

```bash
jj commit -m "refactor: session-lifecycle.ts スケルトン作成 + handleSnoozeArrival 移植

WHY: オーケストレーション層の骨格を作成。handleSnoozeArrival を移植し、
snoozeFiresAt の永続化更新に対応。スタブ関数は後続タスクで TDD 実装する。"
```

---

### Task 6: TDD startMorningSession

**Files:**
- Create: `src/__tests__/session-lifecycle.test.ts`
- Modify: `src/services/session-lifecycle.ts`

**Step 1: Write failing tests**

```typescript
jest.mock('../services/alarm-kit', () => ({
  scheduleSnoozeAlarms: jest.fn().mockResolvedValue(['snooze-1', 'snooze-2']),
  startLiveActivity: jest.fn().mockResolvedValue('activity-1'),
  cancelAlarmsByIds: jest.fn().mockResolvedValue(undefined),
  endLiveActivity: jest.fn().mockResolvedValue(undefined),
  scheduleWakeTargetAlarm: jest.fn().mockResolvedValue(['alarm-new']),
  updateLiveActivity: jest.fn(),
  SNOOZE_DURATION_SECONDS: 540,
}));

import {
  handleSnoozeArrival,
  startMorningSession,
} from '../services/session-lifecycle';
import { useMorningSessionStore } from '../stores/morning-session-store';
import { useWakeRecordStore } from '../stores/wake-record-store';
import type { MorningSession } from '../types/morning-session';
import type { WakeTarget } from '../types/wake-target';
import { scheduleSnoozeAlarms, startLiveActivity } from '../services/alarm-kit';

function setActiveSession(overrides?: Partial<MorningSession>): void {
  // ... same as snooze.test.ts but with snoozeAlarmIds/snoozeFiresAt defaults
}

describe('session lifecycle service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useMorningSessionStore.setState({
      session: null,
      loaded: true,
    });
  });

  // handleSnoozeArrival tests (migrated from snooze.test.ts) ...

  describe('startMorningSession', () => {
    const target: WakeTarget = {
      defaultTime: { hour: 7, minute: 0 },
      dayOverrides: {},
      nextOverride: null,
      todos: [
        { id: 'todo-1', title: 'Stretch', completed: false },
        { id: 'todo-2', title: 'Water', completed: false },
      ],
      enabled: true,
      soundId: 'default',
      targetSleepMinutes: null,
      wakeUpGoalBufferMinutes: 30,
    };

    const baseParams = {
      target,
      resolvedTime: { hour: 7, minute: 0 },
      dismissTime: new Date('2026-03-01T07:01:00.000Z'),
      mountedAt: new Date('2026-03-01T06:59:55.000Z'),
      dayBoundaryHour: 4,
    };

    test('creates record + session + snooze + LA for target with todos', async () => {
      await startMorningSession(baseParams);

      const records = useWakeRecordStore.getState().records;
      expect(records).toHaveLength(1);

      const session = useMorningSessionStore.getState().session;
      expect(session).not.toBeNull();
      expect(session!.snoozeAlarmIds).toEqual(['snooze-1', 'snooze-2']);
      expect(session!.snoozeFiresAt).not.toBeNull();
      expect(session!.liveActivityId).toBe('activity-1');

      expect(scheduleSnoozeAlarms).toHaveBeenCalledWith(baseParams.dismissTime);
      expect(startLiveActivity).toHaveBeenCalled();
    });

    test('creates only record when target has no todos', async () => {
      await startMorningSession({
        ...baseParams,
        target: { ...target, todos: [] },
      });

      expect(useWakeRecordStore.getState().records).toHaveLength(1);
      expect(useMorningSessionStore.getState().session).toBeNull();
      expect(scheduleSnoozeAlarms).not.toHaveBeenCalled();
    });

    test('session survives snooze scheduling failure', async () => {
      (scheduleSnoozeAlarms as jest.Mock).mockRejectedValueOnce(new Error('native'));

      await startMorningSession(baseParams);

      expect(useMorningSessionStore.getState().session).not.toBeNull();
      expect(useMorningSessionStore.getState().session!.snoozeAlarmIds).toEqual([]);
    });

    test('session survives Live Activity failure', async () => {
      (startLiveActivity as jest.Mock).mockRejectedValueOnce(new Error('LA'));

      await startMorningSession(baseParams);

      const session = useMorningSessionStore.getState().session;
      expect(session).not.toBeNull();
      expect(session!.liveActivityId).toBeNull();
      expect(session!.snoozeAlarmIds).toEqual(['snooze-1', 'snooze-2']);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --testPathPattern=session-lifecycle`
Expected: FAIL with "Not implemented"

**Step 3: Implement startMorningSession**

Replace stub in `src/services/session-lifecycle.ts`:

```typescript
export async function startMorningSession(params: StartSessionParams): Promise<void> {
  const { target, resolvedTime, dismissTime, mountedAt, dayBoundaryHour } = params;
  const hasTodos = target.todos.length > 0;
  const dateStr = getLogicalDateString(dismissTime, dayBoundaryHour);
  const diffMinutes = calculateDiffMinutes(resolvedTime, dismissTime);
  const result = calculateWakeResult(diffMinutes);

  const todoRecords: readonly WakeTodoRecord[] = target.todos.map((todo) => ({
    id: todo.id,
    title: todo.title,
    completedAt: null,
    orderCompleted: null,
  }));

  // 起床目標デッドライン: アラーム時刻 + バッファ分数
  const goalDeadline = hasTodos
    ? new Date(
        dismissTime.getFullYear(),
        dismissTime.getMonth(),
        dismissTime.getDate(),
        resolvedTime.hour,
        resolvedTime.minute + target.wakeUpGoalBufferMinutes,
        0,
      ).toISOString()
    : null;

  // 1. WakeRecord 作成（失敗時は throw）
  const { addRecord } = useWakeRecordStore.getState();
  const record = await addRecord({
    alarmId: 'wake-target',
    date: dateStr,
    targetTime: resolvedTime,
    alarmTriggeredAt: mountedAt.toISOString(),
    dismissedAt: dismissTime.toISOString(),
    healthKitWakeTime: null,
    result,
    diffMinutes,
    todos: todoRecords,
    todoCompletionSeconds: 0,
    alarmLabel: '',
    todosCompleted: !hasTodos,
    todosCompletedAt: hasTodos ? null : dismissTime.toISOString(),
    goalDeadline,
  });

  if (!hasTodos) return;

  // 2. セッション作成 + AsyncStorage 永続化
  const sessionTodos: readonly SessionTodo[] = target.todos.map((todo) => ({
    id: todo.id,
    title: todo.title,
    completed: false,
    completedAt: null,
  }));
  const store = useMorningSessionStore.getState();
  await store.startSession(record.id, dateStr, sessionTodos, goalDeadline);

  // 3. スヌーズ先行スケジュール（失敗してもセッション自体は有効）
  try {
    const snoozeIds = await scheduleSnoozeAlarms(dismissTime);
    const snoozeFiresAt = new Date(
      dismissTime.getTime() + SNOOZE_DURATION_SECONDS * 1000,
    ).toISOString();
    // session 内に永続化（アプリ kill 後も ID ベースキャンセル可能）
    await useMorningSessionStore.getState().setSnoozeState(snoozeIds, snoozeFiresAt);
  } catch {
    // スヌーズ失敗はログのみ — セッションは続行
  }

  // 4. Live Activity 開始（失敗してもセッション自体は有効）
  try {
    const { session: currentSession } = useMorningSessionStore.getState();
    const liveActivityTodos = target.todos.map((td) => ({
      id: td.id,
      title: td.title,
      completed: false,
    }));
    const activityId = await startLiveActivity(
      liveActivityTodos,
      currentSession?.snoozeFiresAt ?? null,
    );
    if (activityId !== null) {
      await useMorningSessionStore.getState().setLiveActivityId(activityId);
    }
  } catch {
    // Live Activity 失敗はログのみ — セッションは続行
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test -- --testPathPattern=session-lifecycle`
Expected: PASS

**Step 5: Commit**

```bash
jj commit -m "feat: startMorningSession を TDD 実装

WHY: wakeup.tsx の 80行の .then() チェーンを逐次 await に置き換え。
snooze state を session 内に永続化し、エラー境界を明確にした。"
```

---

### Task 7: TDD completeMorningSession

**Files:**
- Modify: `src/__tests__/session-lifecycle.test.ts`
- Modify: `src/services/session-lifecycle.ts`

**Step 1: Write failing tests**

```typescript
import {
  completeMorningSession,
  // ... existing imports
} from '../services/session-lifecycle';
import {
  cancelAlarmsByIds,
  endLiveActivity,
  scheduleWakeTargetAlarm,
} from '../services/alarm-kit';
import { useWakeTargetStore } from '../stores/wake-target-store';

describe('completeMorningSession', () => {
  function setupCompletedSession(): MorningSession {
    const session: MorningSession = {
      recordId: 'rec-1',
      date: '2026-03-01',
      startedAt: '2026-03-01T07:00:00.000Z',
      todos: [
        { id: 'todo-1', title: 'Stretch', completed: true, completedAt: '2026-03-01T07:05:00.000Z' },
        { id: 'todo-2', title: 'Water', completed: true, completedAt: '2026-03-01T07:10:00.000Z' },
      ],
      liveActivityId: 'la-1',
      goalDeadline: '2026-03-01T07:30:00.000Z',
      snoozeAlarmIds: ['snooze-1', 'snooze-2', 'snooze-3'],
      snoozeFiresAt: '2026-03-01T07:18:00.000Z',
    };
    useMorningSessionStore.setState({ session, loaded: true });
    // ... setup record store and target store ...
    return session;
  }

  test('cancels only snooze alarms (not all), ends LA, clears session, reschedules wake', async () => {
    const session = setupCompletedSession();
    await completeMorningSession(session);

    // cancelAlarmsByIds で snooze ID のみキャンセル（cancelAllAlarms ではない）
    expect(cancelAlarmsByIds).toHaveBeenCalledWith(['snooze-1', 'snooze-2', 'snooze-3']);
    expect(endLiveActivity).toHaveBeenCalledWith('la-1');
    expect(useMorningSessionStore.getState().session).toBeNull();
    // wake-target 再スケジュール
    expect(scheduleWakeTargetAlarm).toHaveBeenCalled();
  });

  test('clears session even when updateRecord fails', async () => {
    const session = setupCompletedSession();
    const mockUpdateRecord = jest.fn().mockRejectedValue(new Error('full'));
    useWakeRecordStore.setState({ updateRecord: mockUpdateRecord });

    await completeMorningSession(session);
    expect(useMorningSessionStore.getState().session).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --testPathPattern=session-lifecycle`
Expected: FAIL with "Not implemented"

**Step 3: Implement completeMorningSession**

```typescript
export async function completeMorningSession(session: MorningSession): Promise<void> {
  const now = new Date();

  // 1. スヌーズアラームのみキャンセル（名前空間分離）
  await cancelAlarmsByIds(session.snoozeAlarmIds);

  // 2. Live Activity 終了（clearSession で ID が消える前に）
  if (session.liveActivityId !== null) {
    await endLiveActivity(session.liveActivityId);
  }

  // 3. WakeRecord 更新
  const todoCompletionSeconds = Math.round(
    (now.getTime() - new Date(session.startedAt).getTime()) / 1000,
  );
  const todoRecords: readonly WakeTodoRecord[] = session.todos.map((todo, index) => ({
    id: todo.id,
    title: todo.title,
    completedAt: todo.completedAt,
    orderCompleted: todo.completed ? index + 1 : null,
  }));

  // goalDeadline ベースの result 再判定
  const goalBasedResult =
    session.goalDeadline !== null
      ? now.getTime() <= new Date(session.goalDeadline).getTime()
        ? ('great' as const)
        : ('late' as const)
      : undefined;

  const { updateRecord } = useWakeRecordStore.getState();
  try {
    await updateRecord(session.recordId, {
      todosCompleted: true,
      todosCompletedAt: now.toISOString(),
      todoCompletionSeconds,
      todos: todoRecords,
      ...(goalBasedResult !== undefined ? { result: goalBasedResult } : {}),
    });
  } catch {
    // レコード更新失敗でもセッションはクリアする（無限再発火防止）
  }

  // 4. セッションクリア
  await useMorningSessionStore.getState().clearSession();

  // 5. 通常アラーム再スケジュール（前回の wake-target ID を渡して選択的キャンセル）
  const { target, alarmIds, setAlarmIds } = useWakeTargetStore.getState();
  if (target?.enabled) {
    const newIds = await scheduleWakeTargetAlarm(target, alarmIds);
    await setAlarmIds(newIds);
  }
}
```

**Step 4: Run tests**

Run: `pnpm test -- --testPathPattern=session-lifecycle`
Expected: PASS

**Step 5: Commit**

```bash
jj commit -m "feat: completeMorningSession を TDD 実装

WHY: cancelAlarmsByIds で snooze のみ選択的にキャンセル。
cancelAllAlarms() の無差別キャンセルを排除し、
wake-target アラームへの巻き添えを防止。"
```

---

### Task 8: TDD restoreSessionOnLaunch

**Files:**
- Modify: `src/__tests__/session-lifecycle.test.ts`
- Modify: `src/services/session-lifecycle.ts`

**Step 1: Write failing tests**

```typescript
import { restoreSessionOnLaunch } from '../services/session-lifecycle';

describe('restoreSessionOnLaunch', () => {
  test('cleans up stale session (different day) and ends Live Activity', () => {
    setActiveSession({ date: '2026-02-27', liveActivityId: 'la-stale' });

    restoreSessionOnLaunch(4);

    expect(endLiveActivity).toHaveBeenCalledWith('la-stale');
    expect(useMorningSessionStore.getState().session).toBeNull();
  });

  test('does nothing for active session with snoozeFiresAt already persisted', () => {
    // snoozeFiresAt が永続化済みなので restoreSnoozeCountdown は不要
    const today = getLogicalDateString(new Date(), 4);
    setActiveSession({
      date: today,
      snoozeFiresAt: '2026-03-02T07:09:00.000Z',
    });

    restoreSessionOnLaunch(4);

    // セッションはそのまま（スヌーズカウントダウンも永続化済み）
    expect(useMorningSessionStore.getState().session).not.toBeNull();
    expect(useMorningSessionStore.getState().session!.snoozeFiresAt).toBe(
      '2026-03-02T07:09:00.000Z',
    );
  });

  test('ends dangling Live Activity for completed session', () => {
    const today = getLogicalDateString(new Date(), 4);
    setActiveSession({
      date: today,
      liveActivityId: 'la-dangling',
      todos: [
        { id: 'todo-1', title: 'Done', completed: true, completedAt: '2026-03-02T07:05:00.000Z' },
      ],
    });

    restoreSessionOnLaunch(4);
    expect(endLiveActivity).toHaveBeenCalledWith('la-dangling');
  });

  test('does nothing when no session exists', () => {
    restoreSessionOnLaunch(4);
    expect(endLiveActivity).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --testPathPattern=session-lifecycle`
Expected: FAIL with "Not implemented"

**Step 3: Implement restoreSessionOnLaunch**

```typescript
/**
 * アプリ通常起動時のセッション復元・クリーンアップ。
 *
 * snoozeFiresAt は MorningSession 内に永続化済みのため、
 * 従来の restoreSnoozeCountdown()（逆算ロジック）は不要。
 * ロード時にそのまま session.snoozeFiresAt を読み込める。
 */
export function restoreSessionOnLaunch(dayBoundaryHour: number): void {
  const state = useMorningSessionStore.getState();
  if (state.session === null) return;

  // 1. 期限切れセッション（前日以前）のクリーンアップ
  const today = getLogicalDateString(new Date(), dayBoundaryHour);
  if (state.session.date !== today) {
    if (state.session.liveActivityId !== null) {
      endLiveActivity(state.session.liveActivityId);
    }
    state.clearSession();
    return;
  }

  // 2. TODO全完了済みだが Live Activity が残っている場合のクリーンアップ
  if (state.areAllCompleted() && state.session.liveActivityId !== null) {
    endLiveActivity(state.session.liveActivityId);
  }

  // snoozeFiresAt は session 内に永続化されているため、復元ロジックは不要。
  // loadSession() 時点で session.snoozeFiresAt が復元済み。
}
```

**Step 4: Run tests**

Run: `pnpm test -- --testPathPattern=session-lifecycle`
Expected: PASS

**Step 5: Commit**

```bash
jj commit -m "feat: restoreSessionOnLaunch を TDD 実装

WHY: snoozeFiresAt の永続化により restoreSnoozeCountdown() の
逆算ロジックが不要になった。クリーンアップのみに責務を限定。"
```

---

### Task 9: wakeup.tsx を簡素化

**Files:**
- Modify: `app/wakeup.tsx`

**Step 1: Update imports (lines 1-23)**

削除するインポート: `SNOOZE_DURATION_SECONDS`, `scheduleSnoozeAlarms`, `startLiveActivity` (from alarm-kit), `useMorningSessionStore`, `useWakeRecordStore`, `SessionTodo`, `WakeTodoRecord`, `calculateDiffMinutes`, `calculateWakeResult`, `getLogicalDateString`

追加するインポート: `startMorningSession` (from session-lifecycle)

```typescript
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, colors, fontSize, spacing } from '../src/constants/theme';
import { cancelAllAlarms } from '../src/services/alarm-kit';
import { startMorningSession } from '../src/services/session-lifecycle';
import { playAlarmSound, stopAlarmSound } from '../src/services/sound';
import { useSettingsStore } from '../src/stores/settings-store';
import { useWakeTargetStore } from '../src/stores/wake-target-store';
import { formatTime } from '../src/types/alarm';
import { resolveTimeForDate } from '../src/types/wake-target';
```

**Step 2: Replace handleDismiss (lines 85-223)**

```typescript
const handleDismiss = useCallback(() => {
  if (dismissing) return;
  setDismissing(true);

  stopAlarmSound();
  Vibration.cancel();

  if (alarmIds.length > 0) {
    cancelAllAlarms().then(() => setAlarmIds([]));
  }

  if (isDemo) {
    router.back();
    return;
  }

  if (target !== null && resolvedTime !== null) {
    startMorningSession({
      target,
      resolvedTime,
      dismissTime: new Date(),
      mountedAt: mountedAt.current,
      dayBoundaryHour,
    }).catch((e: unknown) => {
      // biome-ignore lint/suspicious/noConsole: デバッグ用
      console.error('[WakeUp] Failed to start session:', e);
      Alert.alert(t('error.title'), t('error.recordSaveFailed'));
    });
  }

  void clearNextOverride();
  router.replace('/');
}, [
  dismissing,
  target,
  resolvedTime,
  isDemo,
  dayBoundaryHour,
  alarmIds,
  setAlarmIds,
  clearNextOverride,
  router,
  t,
]);
```

**Note:** `addRecord`, `startSession` のフック購読を削除。`useMorningSessionStore` と `useWakeRecordStore` のインポートを削除。

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
jj commit -m "refactor: wakeup.tsx handleDismiss を startMorningSession 1行に簡素化

WHY: 80行の .then() チェーンをサービス呼び出し1行に置き換え。
コンポーネントはUI責務のみに専念し、ビジネスロジックは session-lifecycle に委譲。"
```

---

### Task 10: index.tsx completion effect を簡素化

**Files:**
- Modify: `app/(tabs)/index.tsx`

**Step 1: Update imports (lines 13-29)**

削除: `cancelAllAlarms`, `endLiveActivity`, `scheduleWakeTargetAlarm` (from alarm-kit)
追加: `completeMorningSession` (from session-lifecycle)
削除: `WakeTodoRecord` type import (line 27)

```typescript
import {
  isAlarmKitAvailable,
  updateLiveActivity,
} from '../../src/services/alarm-kit';
import { completeMorningSession } from '../../src/services/session-lifecycle';
```

**Step 2: Replace completion effect (lines 128-188)**

```typescript
useEffect(() => {
  if (session === null || !areAllCompleted()) return;
  completeMorningSession(session).catch(() => {});
}, [session, areAllCompleted]);
```

**Step 3: Update snoozeFiresAt subscription**

`snoozeFiresAt` が store レベルから `session.snoozeFiresAt` に移動したため:

```typescript
// Before:
const snoozeFiresAt = useMorningSessionStore((s) => s.snoozeFiresAt);

// After:
const snoozeFiresAt = useMorningSessionStore((s) => s.session?.snoozeFiresAt ?? null);
```

**Step 4: Remove unused subscriptions**

`clearSession` と `updateRecord` が completion effect でのみ使われていたか確認。
- `clearSession` → completion effect でのみ使用 → 削除
- `updateRecord` → completion effect でのみ使用 → 削除

**Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 6: Commit**

```bash
jj commit -m "refactor: index.tsx completion effect を completeMorningSession 1行に簡素化

WHY: 60行の effect + fire-and-forget チェーンをサービス呼び出し1行に置き換え。
cancelAlarmsByIds で snooze のみ選択的にキャンセルする新方式を使用。"
```

---

### Task 11: _layout.tsx を簡素化

**Files:**
- Modify: `app/_layout.tsx`

**Step 1: Update imports**

削除: `endLiveActivity` (from alarm-kit), `handleSnoozeArrival`, `restoreSnoozeCountdown` (from snooze)
追加: `handleSnoozeArrival`, `restoreSessionOnLaunch` (from session-lifecycle)

```typescript
import {
  cancelAllAlarms,
  checkLaunchPayload,
  initializeAlarmKit,
  scheduleWakeTargetAlarm,
} from '../src/services/alarm-kit';
import { registerBackgroundSync } from '../src/services/background-sync';
import { handleSnoozeArrival, restoreSessionOnLaunch } from '../src/services/session-lifecycle';
import { syncWidget } from '../src/services/widget-sync';
```

**Step 2: Delete cleanupStaleSession function (lines 40-57)**

この関数は `restoreSessionOnLaunch()` に統合される。

**Step 3: Simplify initialization logic (lines 106-144)**

```typescript
const payload = checkLaunchPayload();
if (payload !== null) {
  if (isSnoozePayload(payload)) {
    sessionLoaded.then(() => {
      handleSnoozeArrival();
      router.push('/');
    });
  } else {
    coreLoaded.then(() => {
      restoreSessionOnLaunch(useSettingsStore.getState().dayBoundaryHour);
    });
    router.push('/wakeup');
  }
} else {
  coreLoaded.then(() => {
    restoreSessionOnLaunch(useSettingsStore.getState().dayBoundaryHour);
  });
}
```

**Step 4: Update alarm re-schedule effect to pass previousIds (lines 178-201)**

```typescript
useEffect(() => {
  if (target === null || !sessionStoreLoaded) return;
  if (useMorningSessionStore.getState().isActive()) return;

  const { alarmIds } = useWakeTargetStore.getState();
  if (target.enabled) {
    scheduleWakeTargetAlarm(target, alarmIds).then((newIds) => {
      setAlarmIds(newIds);
    });
  } else {
    cancelAllAlarms().then(() => {
      setAlarmIds([]);
    });
  }
}, [target, sessionStoreLoaded]);
```

**Step 5: Remove `getLogicalDateString` import** (使わなくなった)

**Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 7: Commit**

```bash
jj commit -m "refactor: _layout.tsx を restoreSessionOnLaunch + previousIds に簡素化

WHY: cleanupStaleSession と restoreSnoozeCountdown の2つの散在した処理を
restoreSessionOnLaunch に統合。scheduleWakeTargetAlarm に previousIds を渡して
スヌーズ巻き添えキャンセルを防止。"
```

---

### Task 12: 旧ファイル削除 + store クリーンアップ

**Files:**
- Delete: `src/services/snooze.ts`
- Delete: `src/__tests__/snooze.test.ts`
- Modify: `src/stores/morning-session-store.ts` (store レベル snooze フィールド削除)

**Step 1: Delete snooze service files**

```bash
rm src/services/snooze.ts src/__tests__/snooze.test.ts
```

**Step 2: Verify no remaining references to snooze.ts**

Run: `grep -r "from.*services/snooze" src/ app/ --include='*.ts' --include='*.tsx'`
Expected: No matches

**Step 3: Clean up MorningSessionState interface**

`MorningSessionState` から store レベルの `snoozeAlarmIds` / `snoozeFiresAt` フィールドを削除（session 内に移動済み）:

- 削除: `readonly snoozeAlarmIds: readonly string[]`
- 削除: `readonly snoozeFiresAt: string | null`
- 削除: `setSnoozeAlarmIds` action
- 維持: `setSnoozeFiresAt` action（session 内フィールドの更新用に名前変更済み）
- 維持: `setSnoozeState` action（Task 2 で追加済み）

**Step 4: Run full test suite**

Run: `pnpm typecheck && pnpm test && pnpm lint`
Expected: All PASS

**Step 5: Commit**

```bash
jj commit -m "chore: snooze.ts 削除 + store レベル snooze state 削除

WHY: snooze 関連ロジックは session-lifecycle.ts に統合済み。
snooze state は MorningSession 内に永続化済みで、
store レベルのメモリのみフィールドは不要。"
```

---

### Task 13: 最終検証

**Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS, no errors

**Step 2: Run all tests**

Run: `pnpm test`
Expected: All PASS

**Step 3: Run lint**

Run: `pnpm lint`
Expected: No errors

**Step 4: Verify file structure**

```bash
ls src/services/session-lifecycle.ts        # exists
ls src/__tests__/session-lifecycle.test.ts   # exists
ls src/services/snooze.ts 2>/dev/null        # should not exist
ls src/__tests__/snooze.test.ts 2>/dev/null  # should not exist
```

**Step 5: Verify no references to deleted files**

```bash
grep -r "snooze" src/services/ --include='*.ts' -l
# should only show alarm-kit.ts (scheduleSnoozeAlarms) and session-lifecycle.ts
```

**Step 6: Push**

```bash
jj git push
```

---

## 変更サマリ

| Before | After |
|--------|-------|
| `snoozeAlarmIds` メモリのみ | MorningSession 内に永続化 |
| `snoozeFiresAt` メモリのみ + 逆算復元 | MorningSession 内に永続化、復元不要 |
| `cancelAllAlarms()` 無差別キャンセル | `cancelAlarmsByIds()` 選択的キャンセル |
| `scheduleWakeTargetAlarm` が全アラーム削除 | previousIds のみキャンセル |
| wakeup.tsx 80行の .then() チェーン | `startMorningSession()` 1行 |
| index.tsx 60行の completion effect | `completeMorningSession()` 1行 |
| _layout.tsx cleanupStaleSession + restoreSnoozeCountdown | `restoreSessionOnLaunch()` 1行 |
| snooze.ts（独立サービス） | session-lifecycle.ts に統合 |
| 3ファイルに散在するオーケストレーション | session-lifecycle.ts に集約 |
