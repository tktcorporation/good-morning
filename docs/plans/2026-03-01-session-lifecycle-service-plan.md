# Session Lifecycle Service Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** セッション管理のオーケストレーションを `session-lifecycle.ts` に集約し、コンポーネントを薄くする

**Architecture:** snooze.ts の関数 + wakeup.tsx/index.tsx/_layout.tsx に散在するビジネスロジックを `src/services/session-lifecycle.ts` に統合。コンポーネントはサービス呼び出し1行に簡素化。TDD で各関数を実装。

**Tech Stack:** TypeScript, Zustand, Jest, expo-alarm-kit

**Design doc:** `docs/plans/2026-03-01-session-lifecycle-service-design.md`

---

### Task 1: session-lifecycle.ts スケルトン + 関数移動

snooze.ts から `handleSnoozeArrival` と `restoreSnoozeCountdown` をそのまま移動し、新関数のスタブを追加する。

**Files:**
- Create: `src/services/session-lifecycle.ts`

**Step 1: Create session-lifecycle.ts with moved functions + stubs**

```typescript
// src/services/session-lifecycle.ts

/**
 * セッションのライフサイクル操作を一元管理するオーケストレーション層。
 *
 * 背景: セッション操作が wakeup.tsx（開始）→ index.tsx（完了）→ _layout.tsx（復元）に
 * 散在していたため、全操作をこのモジュールに集約した。各関数が alarm-kit, stores を
 * 協調させ、コンポーネントは1行の呼び出しで済む。
 *
 * 設計: docs/plans/2026-03-01-session-lifecycle-service-design.md
 */

import type { AlarmTime } from '../types/alarm';
import type { MorningSession, SessionTodo } from '../types/morning-session';
import type { WakeTodoRecord } from '../types/wake-record';
import type { WakeTarget } from '../types/wake-target';
import {
  SNOOZE_DURATION_SECONDS,
  SNOOZE_MAX_COUNT,
  cancelAllAlarms,
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
 * @returns true if session is active with incomplete todos, false otherwise
 */
export function handleSnoozeArrival(): boolean {
  const sessionState = useMorningSessionStore.getState();
  if (sessionState.session === null || sessionState.areAllCompleted()) {
    return false;
  }

  // 次のスヌーズ発火時刻を計算してストアに保存（カウントダウン表示用）
  const nextSnoozeFiresAt = new Date(Date.now() + SNOOZE_DURATION_SECONDS * 1000).toISOString();
  useMorningSessionStore.getState().setSnoozeFiresAt(nextSnoozeFiresAt);

  // Live Activity を更新（カウントダウン表示を次のスヌーズ時刻に）
  const activityId = sessionState.session.liveActivityId;
  if (activityId !== null) {
    updateLiveActivity(
      activityId,
      sessionState.session.todos.map((t) => ({
        id: t.id,
        title: t.title,
        completed: t.completed,
      })),
      nextSnoozeFiresAt,
    );
  }
  return true;
}

// ── restoreSnoozeCountdown (moved from snooze.ts) ───────────────────

/**
 * アプリ再起動時にスヌーズカウントダウン表示を復元する。
 *
 * 背景: snoozeFiresAt はメモリのみ（永続化しない）ため、アプリ kill → 再起動で消失する。
 * セッション開始時刻と現在時刻から、次に発火するスヌーズの時刻を逆算してストアに設定する。
 * スヌーズ期間（9分 × 20本 = 3時間）が終了している場合は何もしない。
 *
 * 呼び出し元: restoreSessionOnLaunch()（通常起動時、セッションが有効な場合）
 */
export function restoreSnoozeCountdown(sessionStartedAt: string): void {
  const startMs = new Date(sessionStartedAt).getTime();
  const nowMs = Date.now();
  const elapsed = nowMs - startMs;
  const intervalMs = SNOOZE_DURATION_SECONDS * 1000;
  const totalDurationMs = intervalMs * SNOOZE_MAX_COUNT;

  // 全スヌーズが発火済み（3時間経過）なら復元不要
  if (elapsed >= totalDurationMs) return;

  // 次のスヌーズ発火時刻を逆算: ceil(経過時間 / 間隔) 番目のスヌーズ
  const nextIndex = Math.ceil(elapsed / intervalMs);
  const nextFireMs = startMs + nextIndex * intervalMs;

  // 計算上の発火時刻が既に過ぎている場合（境界値）はスキップ
  if (nextFireMs <= nowMs) return;

  useMorningSessionStore.getState().setSnoozeFiresAt(new Date(nextFireMs).toISOString());
}

// ── Stubs for new functions (Task 3-5 で実装) ───────────────────────

/** startMorningSession のパラメータ */
export interface StartSessionParams {
  readonly target: WakeTarget;
  readonly resolvedTime: AlarmTime;
  readonly dismissTime: Date;
  readonly mountedAt: Date;
  readonly dayBoundaryHour: number;
}

/**
 * セッション開始: record作成 → session作成 → snoozeスケジュール → Live Activity開始。
 * 実装は Task 3 で追加。
 */
export async function startMorningSession(_params: StartSessionParams): Promise<void> {
  throw new Error('Not implemented');
}

/**
 * セッション完了: cancelAlarms → endLA → updateRecord → clearSession → reschedule。
 * 実装は Task 4 で追加。
 */
export async function completeMorningSession(_session: MorningSession): Promise<void> {
  throw new Error('Not implemented');
}

/**
 * アプリ通常起動時のセッション復元・クリーンアップ。
 * 実装は Task 5 で追加。
 */
export function restoreSessionOnLaunch(_dayBoundaryHour: number): void {
  throw new Error('Not implemented');
}
```

**Step 2: Run tests to ensure existing tests still pass**

Run: `pnpm test -- --testPathPattern=snooze`
Expected: PASS (snooze.test.ts は既存のまま、snooze.ts もまだ残っている)

**Step 3: Commit**

```bash
jj commit -m "refactor: session-lifecycle.ts を作成し handleSnoozeArrival/restoreSnoozeCountdown を移植"
```

---

### Task 2: テストファイル作成 + スヌーズテスト移植

snooze.test.ts のテストを session-lifecycle.test.ts に移植する。alarm-kit をモック。

**Files:**
- Create: `src/__tests__/session-lifecycle.test.ts`

**Step 1: Create test file with migrated tests + alarm-kit mock**

```typescript
// src/__tests__/session-lifecycle.test.ts

jest.mock('../services/alarm-kit', () => ({
  scheduleSnoozeAlarms: jest.fn().mockResolvedValue(['snooze-1', 'snooze-2']),
  startLiveActivity: jest.fn().mockResolvedValue('activity-1'),
  cancelAllAlarms: jest.fn().mockResolvedValue(undefined),
  endLiveActivity: jest.fn().mockResolvedValue(undefined),
  scheduleWakeTargetAlarm: jest.fn().mockResolvedValue(['alarm-new']),
  updateLiveActivity: jest.fn(),
  SNOOZE_DURATION_SECONDS: 540,
  SNOOZE_MAX_COUNT: 20,
}));

import {
  handleSnoozeArrival,
  restoreSnoozeCountdown,
} from '../services/session-lifecycle';
import { useMorningSessionStore } from '../stores/morning-session-store';
import type { MorningSession } from '../types/morning-session';

/**
 * セッションストアにテスト用のアクティブセッション（TODO未完了）をセットする。
 * 各テストで共通のセットアップとして使用。
 */
function setActiveSession(overrides?: Partial<MorningSession>): void {
  const base = {
    recordId: 'rec-1',
    date: '2026-02-28',
    startedAt: '2026-02-28T07:00:00.000Z',
    todos: [
      { id: 'todo-1', title: 'Stretch', completed: false, completedAt: null },
      { id: 'todo-2', title: 'Drink water', completed: false, completedAt: null },
    ] as const,
    liveActivityId: null as string | null,
    ...overrides,
  };
  const session: MorningSession = {
    ...base,
    liveActivityId: base.liveActivityId ?? null,
  };
  useMorningSessionStore.setState({ session, loaded: true });
}

describe('session lifecycle service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useMorningSessionStore.setState({
      session: null,
      loaded: false,
      snoozeAlarmIds: [],
      snoozeFiresAt: null,
    });
  });

  // ── handleSnoozeArrival (migrated from snooze.test.ts) ────────────

  describe('handleSnoozeArrival', () => {
    test('returns true and updates snoozeFiresAt when session has incomplete todos', () => {
      setActiveSession();

      const result = handleSnoozeArrival();

      expect(result).toBe(true);
      const state = useMorningSessionStore.getState();
      expect(state.snoozeFiresAt).not.toBeNull();
      const firesAtMs = new Date(state.snoozeFiresAt as string).getTime();
      const expectedMin = Date.now() + 540 * 1000 - 1000;
      const expectedMax = Date.now() + 540 * 1000 + 1000;
      expect(firesAtMs).toBeGreaterThanOrEqual(expectedMin);
      expect(firesAtMs).toBeLessThanOrEqual(expectedMax);
    });

    test('returns false when no session exists', () => {
      const result = handleSnoozeArrival();
      expect(result).toBe(false);
    });

    test('returns false when all todos are completed', () => {
      setActiveSession({
        todos: [
          { id: 'todo-1', title: 'Stretch', completed: true, completedAt: '2026-02-28T07:05:00.000Z' },
          { id: 'todo-2', title: 'Water', completed: true, completedAt: '2026-02-28T07:06:00.000Z' },
        ],
      });

      const result = handleSnoozeArrival();
      expect(result).toBe(false);
    });
  });

  // ── restoreSnoozeCountdown (migrated from snooze.test.ts) ─────────

  describe('restoreSnoozeCountdown', () => {
    test('restores snoozeFiresAt when within snooze window', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      restoreSnoozeCountdown(fiveMinutesAgo);

      const state = useMorningSessionStore.getState();
      expect(state.snoozeFiresAt).not.toBeNull();
      const firesAtMs = new Date(state.snoozeFiresAt as string).getTime();
      const expectedMs = new Date(fiveMinutesAgo).getTime() + 9 * 60 * 1000;
      expect(firesAtMs).toBe(expectedMs);
    });

    test('restores correct snooze after multiple have already fired', () => {
      const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();

      restoreSnoozeCountdown(twentyMinutesAgo);

      const state = useMorningSessionStore.getState();
      expect(state.snoozeFiresAt).not.toBeNull();
      const firesAtMs = new Date(state.snoozeFiresAt as string).getTime();
      const expectedMs = new Date(twentyMinutesAgo).getTime() + 27 * 60 * 1000;
      expect(firesAtMs).toBe(expectedMs);
    });

    test('does not set snoozeFiresAt when all snoozes have fired (3+ hours)', () => {
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

      restoreSnoozeCountdown(fourHoursAgo);

      expect(useMorningSessionStore.getState().snoozeFiresAt).toBeNull();
    });

    test('does not set snoozeFiresAt when exactly at snooze boundary', () => {
      const nineMinutesAgo = new Date(Date.now() - 9 * 60 * 1000).toISOString();

      restoreSnoozeCountdown(nineMinutesAgo);

      const state = useMorningSessionStore.getState();
      expect(state.snoozeFiresAt).toBeNull();
    });
  });
});
```

**Step 2: Run migrated tests**

Run: `pnpm test -- --testPathPattern=session-lifecycle`
Expected: PASS (all 7 tests)

**Step 3: Commit**

```bash
jj commit -m "test: session-lifecycle.test.ts を作成しスヌーズテストを移植"
```

---

### Task 3: TDD startMorningSession

**Files:**
- Modify: `src/__tests__/session-lifecycle.test.ts`
- Modify: `src/services/session-lifecycle.ts`

**Step 1: Write failing tests for startMorningSession**

Add to `src/__tests__/session-lifecycle.test.ts`, inside `describe('session lifecycle service', ...)`:

```typescript
import {
  handleSnoozeArrival,
  restoreSnoozeCountdown,
  startMorningSession,
} from '../services/session-lifecycle';
import {
  scheduleSnoozeAlarms,
  startLiveActivity,
} from '../services/alarm-kit';
import { useWakeRecordStore } from '../stores/wake-record-store';
import type { WakeTarget } from '../types/wake-target';

// Add below restoreSnoozeCountdown describe block:

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
  };

  const baseParams = {
    target,
    resolvedTime: { hour: 7, minute: 0 },
    dismissTime: new Date('2026-03-01T07:01:00.000Z'),
    mountedAt: new Date('2026-03-01T06:59:55.000Z'),
    dayBoundaryHour: 4,
  };

  test('creates record, starts session, schedules snooze, and starts Live Activity', async () => {
    await startMorningSession(baseParams);

    // WakeRecord が作成されている
    const records = useWakeRecordStore.getState().records;
    expect(records).toHaveLength(1);
    expect(records[0].todosCompleted).toBe(false);
    expect(records[0].targetTime).toEqual({ hour: 7, minute: 0 });

    // MorningSession が作成されている
    const session = useMorningSessionStore.getState().session;
    expect(session).not.toBeNull();
    expect(session!.recordId).toBe(records[0].id);
    expect(session!.todos).toHaveLength(2);
    expect(session!.todos[0].completed).toBe(false);

    // スヌーズがスケジュールされている
    expect(scheduleSnoozeAlarms).toHaveBeenCalledWith(baseParams.dismissTime);
    expect(useMorningSessionStore.getState().snoozeAlarmIds).toEqual(['snooze-1', 'snooze-2']);
    expect(useMorningSessionStore.getState().snoozeFiresAt).not.toBeNull();

    // Live Activity が開始されている
    expect(startLiveActivity).toHaveBeenCalled();
    expect(session!.liveActivityId).toBe('activity-1');
  });

  test('creates only record when target has no todos', async () => {
    const noTodosParams = {
      ...baseParams,
      target: { ...target, todos: [] },
    };

    await startMorningSession(noTodosParams);

    const records = useWakeRecordStore.getState().records;
    expect(records).toHaveLength(1);
    expect(records[0].todosCompleted).toBe(true);

    // セッションは作成されない
    expect(useMorningSessionStore.getState().session).toBeNull();
    expect(scheduleSnoozeAlarms).not.toHaveBeenCalled();
    expect(startLiveActivity).not.toHaveBeenCalled();
  });

  test('session is created even when snooze scheduling fails', async () => {
    (scheduleSnoozeAlarms as jest.Mock).mockRejectedValueOnce(new Error('native error'));

    await startMorningSession(baseParams);

    // セッションは作成されている
    expect(useMorningSessionStore.getState().session).not.toBeNull();
    // スヌーズ状態は未設定
    expect(useMorningSessionStore.getState().snoozeAlarmIds).toEqual([]);
    // Live Activity は試行される（スヌーズとは独立）
    expect(startLiveActivity).toHaveBeenCalled();
  });

  test('session and snooze are valid even when Live Activity fails', async () => {
    (startLiveActivity as jest.Mock).mockRejectedValueOnce(new Error('LA unavailable'));

    await startMorningSession(baseParams);

    const session = useMorningSessionStore.getState().session;
    expect(session).not.toBeNull();
    expect(session!.liveActivityId).toBeNull();
    expect(useMorningSessionStore.getState().snoozeAlarmIds).toEqual(['snooze-1', 'snooze-2']);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- --testPathPattern=session-lifecycle`
Expected: FAIL with "Not implemented"

**Step 3: Implement startMorningSession**

Replace the stub in `src/services/session-lifecycle.ts`:

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

  // 1. WakeRecord 作成（失敗時は throw — レコードなしで続行は不整合）
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
  });

  // TODO がなければセッション不要 — ここで終了
  if (!hasTodos) return;

  // 2. セッション作成 + AsyncStorage 永続化
  const sessionTodos: readonly SessionTodo[] = target.todos.map((todo) => ({
    id: todo.id,
    title: todo.title,
    completed: false,
    completedAt: null,
  }));
  const store = useMorningSessionStore.getState();
  await store.startSession(record.id, dateStr, sessionTodos);

  // 3. スヌーズ先行スケジュール（失敗してもセッション自体は有効）
  let snoozeFiresAt: string | null = null;
  try {
    const snoozeIds = await scheduleSnoozeAlarms(dismissTime);
    snoozeFiresAt = new Date(dismissTime.getTime() + SNOOZE_DURATION_SECONDS * 1000).toISOString();
    useMorningSessionStore.getState().setSnoozeAlarmIds(snoozeIds);
    useMorningSessionStore.getState().setSnoozeFiresAt(snoozeFiresAt);
  } catch {
    // スヌーズ失敗はログのみ — セッションは続行
  }

  // 4. Live Activity 開始（失敗してもセッション自体は有効）
  try {
    const liveActivityTodos = target.todos.map((td) => ({
      id: td.id,
      title: td.title,
      completed: false,
    }));
    const activityId = await startLiveActivity(liveActivityTodos, snoozeFiresAt);
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
Expected: PASS (all 11 tests)

**Step 5: Commit**

```bash
jj commit -m "feat: startMorningSession を実装（TDD）"
```

---

### Task 4: TDD completeMorningSession

**Files:**
- Modify: `src/__tests__/session-lifecycle.test.ts`
- Modify: `src/services/session-lifecycle.ts`

**Step 1: Write failing tests for completeMorningSession**

Add to test file:

```typescript
import {
  // ... existing imports ...
  completeMorningSession,
} from '../services/session-lifecycle';
import {
  // ... existing imports ...
  cancelAllAlarms,
  endLiveActivity,
  scheduleWakeTargetAlarm,
} from '../services/alarm-kit';
import { useWakeTargetStore } from '../stores/wake-target-store';

describe('completeMorningSession', () => {
  function setupActiveSession(): MorningSession {
    const session: MorningSession = {
      recordId: 'rec-1',
      date: '2026-03-01',
      startedAt: '2026-03-01T07:00:00.000Z',
      todos: [
        { id: 'todo-1', title: 'Stretch', completed: true, completedAt: '2026-03-01T07:05:00.000Z' },
        { id: 'todo-2', title: 'Water', completed: true, completedAt: '2026-03-01T07:10:00.000Z' },
      ],
      liveActivityId: 'la-1',
    };
    useMorningSessionStore.setState({ session, loaded: true });
    // addRecord でレコードを登録済みにする
    useWakeRecordStore.setState({
      records: [{
        id: 'rec-1',
        alarmId: 'wake-target',
        date: '2026-03-01',
        targetTime: { hour: 7, minute: 0 },
        alarmTriggeredAt: '2026-03-01T06:59:55.000Z',
        dismissedAt: '2026-03-01T07:00:00.000Z',
        healthKitWakeTime: null,
        result: 'great' as const,
        diffMinutes: 0,
        todos: [],
        todoCompletionSeconds: 0,
        alarmLabel: '',
        todosCompleted: false,
        todosCompletedAt: null,
      }],
      loaded: true,
    });
    // 再スケジュール用の target を設定
    useWakeTargetStore.setState({
      target: {
        defaultTime: { hour: 7, minute: 0 },
        dayOverrides: {},
        nextOverride: null,
        todos: [],
        enabled: true,
        soundId: 'default',
        targetSleepMinutes: null,
      },
    });
    return session;
  }

  test('cancels alarms, ends LA, updates record, clears session, reschedules', async () => {
    const session = setupActiveSession();

    await completeMorningSession(session);

    // 1. 全アラームキャンセル
    expect(cancelAllAlarms).toHaveBeenCalled();

    // 2. Live Activity 終了
    expect(endLiveActivity).toHaveBeenCalledWith('la-1');

    // 3. レコード更新
    const records = useWakeRecordStore.getState().records;
    expect(records[0].todosCompleted).toBe(true);
    expect(records[0].todosCompletedAt).not.toBeNull();

    // 4. セッションクリア
    expect(useMorningSessionStore.getState().session).toBeNull();

    // 5. アラーム再スケジュール
    expect(scheduleWakeTargetAlarm).toHaveBeenCalled();
  });

  test('skips endLiveActivity when liveActivityId is null', async () => {
    const session = setupActiveSession();
    useMorningSessionStore.setState({
      session: { ...session, liveActivityId: null },
    });

    await completeMorningSession({ ...session, liveActivityId: null });

    expect(endLiveActivity).not.toHaveBeenCalled();
    expect(useMorningSessionStore.getState().session).toBeNull();
  });

  test('clears session even when updateRecord fails', async () => {
    const session = setupActiveSession();
    // updateRecord を失敗させる
    const mockUpdateRecord = jest.fn().mockRejectedValue(new Error('storage full'));
    useWakeRecordStore.setState({ updateRecord: mockUpdateRecord });

    await completeMorningSession(session);

    // セッションはクリアされている（無限再発火防止）
    expect(useMorningSessionStore.getState().session).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- --testPathPattern=session-lifecycle`
Expected: FAIL with "Not implemented"

**Step 3: Implement completeMorningSession**

Replace the stub in `src/services/session-lifecycle.ts`:

```typescript
export async function completeMorningSession(session: MorningSession): Promise<void> {
  const now = new Date();

  // 1. 全アラームキャンセル（スヌーズ含む）
  await cancelAllAlarms();

  // 2. Live Activity 終了（clearSession で liveActivityId が消える前に）
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

  const { updateRecord } = useWakeRecordStore.getState();
  try {
    await updateRecord(session.recordId, {
      todosCompleted: true,
      todosCompletedAt: now.toISOString(),
      todoCompletionSeconds,
      todos: todoRecords,
    });
  } catch {
    // updateRecord 失敗時でもセッションをクリアする。
    // レコード更新は失われるが、セッションが残り続けると completion effect が
    // 無限に再発火し、ユーザーが朝ルーティンから抜け出せなくなる。
  }

  // 4. セッションクリア
  await useMorningSessionStore.getState().clearSession();

  // 5. 通常アラーム再スケジュール
  const { target, setAlarmIds } = useWakeTargetStore.getState();
  if (target?.enabled) {
    const newIds = await scheduleWakeTargetAlarm(target);
    await setAlarmIds(newIds);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test -- --testPathPattern=session-lifecycle`
Expected: PASS (all 14 tests)

**Step 5: Commit**

```bash
jj commit -m "feat: completeMorningSession を実装（TDD）"
```

---

### Task 5: TDD restoreSessionOnLaunch

**Files:**
- Modify: `src/__tests__/session-lifecycle.test.ts`
- Modify: `src/services/session-lifecycle.ts`

**Step 1: Write failing tests for restoreSessionOnLaunch**

Add to test file:

```typescript
import {
  // ... existing imports ...
  restoreSessionOnLaunch,
} from '../services/session-lifecycle';

describe('restoreSessionOnLaunch', () => {
  test('cleans up stale session (different day) and ends Live Activity', () => {
    setActiveSession({
      date: '2026-02-27',
      liveActivityId: 'la-stale',
    });

    restoreSessionOnLaunch(4);

    expect(endLiveActivity).toHaveBeenCalledWith('la-stale');
    expect(useMorningSessionStore.getState().session).toBeNull();
  });

  test('restores snooze countdown for active session with incomplete todos', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;

    setActiveSession({
      date: dateStr,
      startedAt: fiveMinutesAgo.toISOString(),
    });

    restoreSessionOnLaunch(4);

    expect(useMorningSessionStore.getState().snoozeFiresAt).not.toBeNull();
    expect(useMorningSessionStore.getState().session).not.toBeNull();
  });

  test('ends Live Activity for completed session that still has active LA', () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;

    setActiveSession({
      date: dateStr,
      liveActivityId: 'la-dangling',
      todos: [
        { id: 'todo-1', title: 'Stretch', completed: true, completedAt: '2026-03-01T07:05:00.000Z' },
      ],
    });

    restoreSessionOnLaunch(4);

    expect(endLiveActivity).toHaveBeenCalledWith('la-dangling');
  });

  test('does nothing when no session exists', () => {
    restoreSessionOnLaunch(4);

    expect(endLiveActivity).not.toHaveBeenCalled();
    expect(useMorningSessionStore.getState().session).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- --testPathPattern=session-lifecycle`
Expected: FAIL with "Not implemented"

**Step 3: Implement restoreSessionOnLaunch**

Replace the stub in `src/services/session-lifecycle.ts`:

```typescript
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

  // 2. アクティブセッション（TODO未完了）のスヌーズカウントダウン復元
  if (!state.areAllCompleted()) {
    restoreSnoozeCountdown(state.session.startedAt);
    return;
  }

  // 3. TODO全完了済みだが Live Activity が残っている場合のクリーンアップ
  if (state.session.liveActivityId !== null) {
    endLiveActivity(state.session.liveActivityId);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test -- --testPathPattern=session-lifecycle`
Expected: PASS (all 18 tests)

**Step 5: Commit**

```bash
jj commit -m "feat: restoreSessionOnLaunch を実装（TDD）"
```

---

### Task 6: wakeup.tsx を簡素化

**Files:**
- Modify: `app/wakeup.tsx:1-23` (imports)
- Modify: `app/wakeup.tsx:85-197` (handleDismiss)

**Step 1: Update imports**

Replace lines 1-23:

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

Removed imports:
- `SNOOZE_DURATION_SECONDS`, `scheduleSnoozeAlarms`, `startLiveActivity` from alarm-kit
- `useMorningSessionStore` (no longer used in handleDismiss — check if used elsewhere in render)
- `useWakeRecordStore` (addRecord moved to service)
- `SessionTodo` type
- `WakeTodoRecord` type
- `calculateDiffMinutes`, `calculateWakeResult` from wake-record
- `getLogicalDateString` from date

**Note:** `useMorningSessionStore` might still be used for other purposes in the render (e.g., showing session status). Check the full file and keep the import if needed.

**Step 2: Replace handleDismiss (lines 85-197)**

```typescript
  const handleDismiss = useCallback(() => {
    if (dismissing) return;
    setDismissing(true);

    stopAlarmSound();
    Vibration.cancel();

    // Cancel remaining scheduled alarms
    if (alarmIds.length > 0) {
      cancelAllAlarms().then(() => {
        setAlarmIds([]);
      });
    }

    if (isDemo) {
      router.back();
      return;
    }

    if (target !== null && resolvedTime !== null) {
      // 意図的な fire-and-forget: セッション開始の全ステップを逐次実行する。
      // 画面遷移はブロックしない。エラー時はユーザーに通知する。
      startMorningSession({
        target,
        resolvedTime,
        dismissTime: new Date(),
        mountedAt: mountedAt.current,
        dayBoundaryHour,
      }).catch((e: unknown) => {
        // biome-ignore lint/suspicious/noConsole: dismiss フローを中断しないが、デバッグ用にエラーは記録する
        console.error('[WakeUp] Failed to start session:', e);
        Alert.alert(t('error.title'), t('error.recordSaveFailed'));
      });
    }

    // 意図的な fire-and-forget: AsyncStorage への永続化が遅延しても画面遷移に影響しない。
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

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
jj commit -m "refactor: wakeup.tsx handleDismiss を startMorningSession に置き換え"
```

---

### Task 7: index.tsx completion effect を簡素化

**Files:**
- Modify: `app/(tabs)/index.tsx:1-29` (imports)
- Modify: `app/(tabs)/index.tsx:124-173` (completion effect)

**Step 1: Update imports**

Replace alarm-kit import (lines 13-19):

```typescript
import {
  isAlarmKitAvailable,
  updateLiveActivity,
} from '../../src/services/alarm-kit';
import { completeMorningSession } from '../../src/services/session-lifecycle';
```

Remove `WakeTodoRecord` type import (line 27) if no longer used elsewhere.

**Step 2: Replace completion effect (lines 124-173)**

```typescript
  // Complete session when all todos are done
  useEffect(() => {
    if (session === null || !areAllCompleted()) return;
    // 全ライフサイクル操作を session-lifecycle サービスに委譲する。
    // cancelAlarms → endLA → updateRecord → clearSession → reschedule を逐次実行。
    completeMorningSession(session).catch(() => {});
  }, [session, areAllCompleted]);
```

Remove `updateRecord` and `clearSession` from the component's hook subscriptions if they were only used in the completion effect. Check the full component.

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
jj commit -m "refactor: index.tsx completion effect を completeMorningSession に置き換え"
```

---

### Task 8: _layout.tsx を簡素化

**Files:**
- Modify: `app/_layout.tsx:1-24` (imports)
- Modify: `app/_layout.tsx:40-57` (remove cleanupStaleSession function)
- Modify: `app/_layout.tsx:104-144` (initialization logic)
- Modify: `app/_layout.tsx:162-176` (AppState listener)

**Step 1: Update imports (lines 8-23)**

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

Removed: `endLiveActivity` from alarm-kit, `restoreSnoozeCountdown` from snooze, entire snooze import.

**Step 2: Delete cleanupStaleSession function (lines 40-57)**

Remove the `cleanupStaleSession` function and its JSDoc comment (lines 40-57). Also remove `getLogicalDateString` import if no longer used.

**Step 3: Simplify initialization logic (lines 104-144)**

Replace with:

```typescript
    const payload = checkLaunchPayload();
    if (payload !== null) {
      if (isSnoozePayload(payload)) {
        // スヌーズ再発火: wakeup 画面を表示せず自動処理する。
        // ネイティブアラームが既にユーザーを起こしているため、アプリ側では
        // Live Activity を更新してダッシュボードへ遷移するだけ。
        sessionLoaded.then(() => {
          handleSnoozeArrival();
          router.push('/');
        });
      } else {
        // 初回アラーム: 古いセッションが残っていればクリーンアップしてから wakeup 画面へ
        coreLoaded.then(() => {
          restoreSessionOnLaunch(useSettingsStore.getState().dayBoundaryHour);
        });
        router.push('/wakeup');
      }
    } else {
      // アラーム経由でない通常起動の場合
      // 期限切れセッションのクリーンアップ + スヌーズカウントダウン復元 + 残留 LA 終了
      coreLoaded.then(() => {
        restoreSessionOnLaunch(useSettingsStore.getState().dayBoundaryHour);
      });
    }
```

**Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 5: Commit**

```bash
jj commit -m "refactor: _layout.tsx の初期化を restoreSessionOnLaunch に置き換え"
```

---

### Task 9: 旧ファイル削除

**Files:**
- Delete: `src/services/snooze.ts`
- Delete: `src/__tests__/snooze.test.ts`

**Step 1: Delete files**

```bash
rm src/services/snooze.ts src/__tests__/snooze.test.ts
```

**Step 2: Verify no remaining references**

Run: `grep -r "from.*snooze" src/ app/ --include='*.ts' --include='*.tsx'`
Expected: No matches (all imports have been updated in Tasks 6-8)

**Step 3: Run full test suite + typecheck + lint**

Run: `pnpm typecheck && pnpm test && pnpm lint`
Expected: All PASS

**Step 4: Commit**

```bash
jj commit -m "chore: snooze.ts を削除（session-lifecycle.ts に統合済み）"
```

---

### Task 10: 最終検証

**Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS, no errors

**Step 2: Run all tests**

Run: `pnpm test`
Expected: All tests PASS

**Step 3: Run lint**

Run: `pnpm lint`
Expected: No errors

**Step 4: Verify file structure**

```bash
ls src/services/session-lifecycle.ts  # exists
ls src/__tests__/session-lifecycle.test.ts  # exists
ls src/services/snooze.ts 2>/dev/null  # should not exist
ls src/__tests__/snooze.test.ts 2>/dev/null  # should not exist
```

**Step 5: Push**

```bash
jj git push
```
