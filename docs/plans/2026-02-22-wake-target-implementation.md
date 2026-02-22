# Wake Target Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the multi-alarm list model with a single WakeTarget singleton, add onboarding wizard with demo experience, and build a Duolingo-style dashboard home screen.

**Architecture:** New `WakeTarget` singleton stored via Zustand + AsyncStorage replaces `Alarm[]`. Onboarding is a single-page stepper component. Home becomes a dashboard with inline Todo editing and weekly calendar. Existing `WakeRecord` model is preserved with minimal changes.

**Tech Stack:** Expo SDK 54 / React Native 0.81 / React 19 / TypeScript strict / Zustand / Expo Router / i18next / pnpm

---

## Task 1: WakeTarget Type Definitions

**Files:**
- Create: `src/types/wake-target.ts`
- Modify: `src/types/alarm.ts` (keep shared types: AlarmTime, DayOfWeek, TodoItem, etc.)

**Step 1: Write the failing test**

Create `src/__tests__/wake-target-types.test.ts`:

```typescript
import {
  resolveTimeForDate,
  type WakeTarget,
  type DayOverride,
} from '../types/wake-target';
import type { DayOfWeek } from '../types/alarm';

describe('resolveTimeForDate', () => {
  const baseTarget: WakeTarget = {
    defaultTime: { hour: 7, minute: 0 },
    dayOverrides: {},
    nextOverride: null,
    todos: [],
    enabled: true,
  };

  test('returns defaultTime when no overrides', () => {
    // Wednesday 2026-02-25
    const date = new Date('2026-02-25T00:00:00');
    expect(resolveTimeForDate(baseTarget, date)).toEqual({ hour: 7, minute: 0 });
  });

  test('returns dayOverride custom time when set for that weekday', () => {
    const target: WakeTarget = {
      ...baseTarget,
      dayOverrides: { 3: { type: 'custom', time: { hour: 6, minute: 30 } } },
    };
    // Wednesday = DayOfWeek 3
    const date = new Date('2026-02-25T00:00:00');
    expect(resolveTimeForDate(target, date)).toEqual({ hour: 6, minute: 30 });
  });

  test('returns null when dayOverride is off', () => {
    const target: WakeTarget = {
      ...baseTarget,
      dayOverrides: { 0: { type: 'off' } },
    };
    // Sunday = DayOfWeek 0
    const date = new Date('2026-02-22T00:00:00');
    expect(resolveTimeForDate(target, date)).toBeNull();
  });

  test('nextOverride takes priority over dayOverride', () => {
    const target: WakeTarget = {
      ...baseTarget,
      dayOverrides: { 3: { type: 'custom', time: { hour: 6, minute: 30 } } },
      nextOverride: { time: { hour: 5, minute: 0 } },
    };
    const date = new Date('2026-02-25T00:00:00');
    expect(resolveTimeForDate(target, date)).toEqual({ hour: 5, minute: 0 });
  });

  test('nextOverride takes priority over defaultTime', () => {
    const target: WakeTarget = {
      ...baseTarget,
      nextOverride: { time: { hour: 5, minute: 45 } },
    };
    const date = new Date('2026-02-25T00:00:00');
    expect(resolveTimeForDate(target, date)).toEqual({ hour: 5, minute: 45 });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- src/__tests__/wake-target-types.test.ts`
Expected: FAIL - cannot resolve `../types/wake-target`

**Step 3: Write the type definitions and implementation**

Create `src/types/wake-target.ts`:

```typescript
import type { AlarmTime, DayOfWeek, TodoItem } from './alarm';

export type DayOverride =
  | { readonly type: 'custom'; readonly time: AlarmTime }
  | { readonly type: 'off' };

export interface NextOverride {
  readonly time: AlarmTime;
}

export interface WakeTarget {
  readonly defaultTime: AlarmTime;
  readonly dayOverrides: Partial<Readonly<Record<DayOfWeek, DayOverride>>>;
  readonly nextOverride: NextOverride | null;
  readonly todos: readonly TodoItem[];
  readonly enabled: boolean;
}

/**
 * Resolve the alarm time for a given date.
 * Priority: nextOverride > dayOverride > defaultTime.
 * Returns null if the day is set to OFF.
 */
export function resolveTimeForDate(target: WakeTarget, date: Date): AlarmTime | null {
  if (target.nextOverride !== null) {
    return target.nextOverride.time;
  }

  const dayOfWeek = date.getDay() as DayOfWeek;
  const override = target.dayOverrides[dayOfWeek];

  if (override !== undefined) {
    if (override.type === 'off') {
      return null;
    }
    return override.time;
  }

  return target.defaultTime;
}

export const DEFAULT_WAKE_TARGET: WakeTarget = {
  defaultTime: { hour: 7, minute: 0 },
  dayOverrides: {},
  nextOverride: null,
  todos: [],
  enabled: true,
};
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- src/__tests__/wake-target-types.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
jj commit -m "feat: add WakeTarget type definitions with resolveTimeForDate"
```

---

## Task 2: WakeTarget Store

**Files:**
- Create: `src/stores/wake-target-store.ts`
- Create: `src/__tests__/wake-target-store.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/wake-target-store.test.ts`:

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWakeTargetStore } from '../stores/wake-target-store';
import type { WakeTarget } from '../types/wake-target';
import { DEFAULT_WAKE_TARGET } from '../types/wake-target';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

// Mock notifications
jest.mock('../services/notifications', () => ({
  scheduleWakeTargetNotifications: jest.fn().mockResolvedValue(['notif-1']),
  cancelAlarmNotifications: jest.fn().mockResolvedValue(undefined),
}));

const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;

describe('useWakeTargetStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWakeTargetStore.setState({
      target: null,
      loaded: false,
      notificationIds: [],
    });
  });

  test('loadTarget returns default when no stored data', async () => {
    mockGetItem.mockResolvedValue(null);
    await useWakeTargetStore.getState().loadTarget();
    const state = useWakeTargetStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.target).toBeNull();
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

    await useWakeTargetStore.getState().removeTodo(todos[0]!.id);
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
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- src/__tests__/wake-target-store.test.ts`
Expected: FAIL - cannot resolve `../stores/wake-target-store`

**Step 3: Write the store implementation**

Create `src/stores/wake-target-store.ts`:

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { AlarmTime, DayOfWeek, TodoItem } from '../types/alarm';
import { createTodoId } from '../types/alarm';
import type { DayOverride, WakeTarget } from '../types/wake-target';

const STORAGE_KEY = 'wake-target';

interface WakeTargetState {
  readonly target: WakeTarget | null;
  readonly loaded: boolean;
  readonly notificationIds: readonly string[];
  loadTarget: () => Promise<void>;
  setTarget: (target: WakeTarget) => Promise<void>;
  updateDefaultTime: (time: AlarmTime) => Promise<void>;
  setNextOverride: (time: AlarmTime) => Promise<void>;
  clearNextOverride: () => Promise<void>;
  setDayOverride: (day: DayOfWeek, override: DayOverride) => Promise<void>;
  removeDayOverride: (day: DayOfWeek) => Promise<void>;
  addTodo: (title: string) => Promise<void>;
  removeTodo: (id: string) => Promise<void>;
  reorderTodos: (todos: readonly TodoItem[]) => Promise<void>;
  toggleEnabled: () => Promise<void>;
  toggleTodoCompleted: (todoId: string) => void;
  resetTodos: () => void;
  areAllTodosCompleted: () => boolean;
}

async function persist(target: WakeTarget): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(target));
}

export const useWakeTargetStore = create<WakeTargetState>((set, get) => ({
  target: null,
  loaded: false,
  notificationIds: [],

  loadTarget: async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as WakeTarget;
      set({ target: parsed, loaded: true });
    } else {
      set({ loaded: true });
    }
  },

  setTarget: async (target: WakeTarget) => {
    set({ target });
    await persist(target);
  },

  updateDefaultTime: async (time: AlarmTime) => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = { ...target, defaultTime: time };
    set({ target: updated });
    await persist(updated);
  },

  setNextOverride: async (time: AlarmTime) => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = { ...target, nextOverride: { time } };
    set({ target: updated });
    await persist(updated);
  },

  clearNextOverride: async () => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = { ...target, nextOverride: null };
    set({ target: updated });
    await persist(updated);
  },

  setDayOverride: async (day: DayOfWeek, override: DayOverride) => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = {
      ...target,
      dayOverrides: { ...target.dayOverrides, [day]: override },
    };
    set({ target: updated });
    await persist(updated);
  },

  removeDayOverride: async (day: DayOfWeek) => {
    const { target } = get();
    if (target === null) return;
    const { [day]: _, ...rest } = target.dayOverrides;
    const updated: WakeTarget = { ...target, dayOverrides: rest };
    set({ target: updated });
    await persist(updated);
  },

  addTodo: async (title: string) => {
    const { target } = get();
    if (target === null) return;
    const newTodo: TodoItem = { id: createTodoId(), title, completed: false };
    const updated: WakeTarget = { ...target, todos: [...target.todos, newTodo] };
    set({ target: updated });
    await persist(updated);
  },

  removeTodo: async (id: string) => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = {
      ...target,
      todos: target.todos.filter((t) => t.id !== id),
    };
    set({ target: updated });
    await persist(updated);
  },

  reorderTodos: async (todos: readonly TodoItem[]) => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = { ...target, todos };
    set({ target: updated });
    await persist(updated);
  },

  toggleEnabled: async () => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = { ...target, enabled: !target.enabled };
    set({ target: updated });
    await persist(updated);
  },

  toggleTodoCompleted: (todoId: string) => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = {
      ...target,
      todos: target.todos.map((t) =>
        t.id === todoId ? { ...t, completed: !t.completed } : t,
      ),
    };
    set({ target: updated });
  },

  resetTodos: () => {
    const { target } = get();
    if (target === null) return;
    const updated: WakeTarget = {
      ...target,
      todos: target.todos.map((t) => ({ ...t, completed: false })),
    };
    set({ target: updated });
  },

  areAllTodosCompleted: (): boolean => {
    const { target } = get();
    if (target === null || target.todos.length === 0) return true;
    return target.todos.every((t) => t.completed);
  },
}));

export type { WakeTargetState };
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- src/__tests__/wake-target-store.test.ts`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
jj commit -m "feat: add WakeTarget store with persistence and todo management"
```

---

## Task 3: Notification Service for WakeTarget

**Files:**
- Modify: `src/services/notifications.ts` — add `scheduleWakeTargetNotifications` function

**Step 1: Write the new scheduling function**

Add to `src/services/notifications.ts`:

```typescript
import type { WakeTarget } from '../types/wake-target';
import { resolveTimeForDate } from '../types/wake-target';

export async function scheduleWakeTargetNotifications(
  target: WakeTarget,
  existingIds: readonly string[],
): Promise<readonly string[]> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return [];

  await cancelAlarmNotifications(existingIds);

  const ids: string[] = [];
  const content: Notifications.NotificationContentInput = {
    title: i18n.t('alarm:notification.title'),
    body: i18n.t('alarm:notification.defaultBody'),
    sound: 'alarm.wav',
    data: { wakeTarget: true },
  };

  // Schedule for each day of the week based on resolved time
  for (let day = 0; day < 7; day++) {
    const dayOfWeek = day as DayOfWeek;
    // Create a date for this weekday to resolve the time
    const testDate = new Date();
    testDate.setDate(testDate.getDate() + ((dayOfWeek - testDate.getDay() + 7) % 7));
    const time = resolveTimeForDate(target, testDate);

    if (time === null) continue; // Day is OFF

    const calendarWeekday = dayOfWeek + 1; // iOS: 1=Sun, 7=Sat
    const id = await Notifications.scheduleNotificationAsync({
      content,
      trigger: buildCalendarTrigger(time, calendarWeekday),
    });
    ids.push(id);
  }

  // If nextOverride exists, also schedule a one-time notification for tomorrow
  if (target.nextOverride !== null) {
    const id = await Notifications.scheduleNotificationAsync({
      content,
      trigger: buildCalendarTrigger(target.nextOverride.time),
    });
    ids.push(id);
  }

  return ids;
}
```

**Step 2: Update notification listener data check in `_layout.tsx`**

The listener currently checks for `alarmId` in notification data. Update to also handle `wakeTarget: true`:

```typescript
// In the listener callback, handle both old alarmId and new wakeTarget format
const data = notification.request.content.data;
if (data?.wakeTarget === true || typeof data?.alarmId === 'string') {
  callback();
}
```

Note: The callback signature will change in Task 6 (RootLayout) since there's no alarm ID anymore.

**Step 3: Run lint and typecheck**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 4: Commit**

```bash
jj commit -m "feat: add WakeTarget notification scheduling"
```

---

## Task 4: i18n Strings

**Files:**
- Modify: `src/i18n/locales/en/common.json`
- Modify: `src/i18n/locales/ja/common.json`
- Create: `src/i18n/locales/en/onboarding.json`
- Create: `src/i18n/locales/ja/onboarding.json`
- Create: `src/i18n/locales/en/dashboard.json`
- Create: `src/i18n/locales/ja/dashboard.json`
- Modify: `src/i18n/index.ts` — register new namespaces

**Step 1: Create onboarding translations**

`src/i18n/locales/en/onboarding.json`:
```json
{
  "welcome": {
    "title": "Good Morning",
    "subtitle": "Track your wake-up routine and build better mornings",
    "start": "Get Started"
  },
  "time": {
    "title": "What time do you want to wake up?",
    "subtitle": "You can change this anytime"
  },
  "todos": {
    "title": "Add your morning tasks",
    "subtitle": "Complete all tasks to dismiss the alarm",
    "addTask": "Add task",
    "placeholder": "e.g. Drink water",
    "presets": {
      "drinkWater": "Drink water",
      "stretch": "Stretch",
      "washFace": "Wash face"
    }
  },
  "permission": {
    "title": "Enable notifications",
    "subtitle": "Required to sound your alarm",
    "allow": "Allow Notifications"
  },
  "demo": {
    "title": "Let's try it out!",
    "subtitle": "Experience what your morning alarm will be like",
    "start": "Start Demo",
    "complete": "All set! Let's go",
    "skip": "Skip"
  },
  "next": "Next",
  "back": "Back"
}
```

`src/i18n/locales/ja/onboarding.json`:
```json
{
  "welcome": {
    "title": "Good Morning",
    "subtitle": "毎朝の起床をトラッキングして、より良い朝を作りましょう",
    "start": "はじめる"
  },
  "time": {
    "title": "何時に起きたいですか？",
    "subtitle": "あとからいつでも変更できます"
  },
  "todos": {
    "title": "朝のタスクを追加しましょう",
    "subtitle": "全てのタスクを完了するとアラームを止められます",
    "addTask": "タスクを追加",
    "placeholder": "例: 水を飲む",
    "presets": {
      "drinkWater": "水を飲む",
      "stretch": "ストレッチ",
      "washFace": "顔を洗う"
    }
  },
  "permission": {
    "title": "通知を許可してください",
    "subtitle": "アラームを鳴らすために必要です",
    "allow": "通知を許可する"
  },
  "demo": {
    "title": "試してみましょう！",
    "subtitle": "朝のアラームがどんな感じか体験してみましょう",
    "start": "デモを開始",
    "complete": "準備完了！はじめましょう",
    "skip": "スキップ"
  },
  "next": "次へ",
  "back": "戻る"
}
```

**Step 2: Create dashboard translations**

`src/i18n/locales/en/dashboard.json`:
```json
{
  "title": "Home",
  "tomorrowTarget": "Tomorrow's Target",
  "todayTarget": "Today's Target",
  "targetOff": "OFF",
  "override": "Tomorrow only",
  "todos": {
    "title": "Morning Tasks",
    "addTask": "Add task",
    "placeholder": "New task",
    "empty": "Add tasks to complete when your alarm rings"
  },
  "week": {
    "title": "This Week",
    "success": "{{count}}/{{total}} success"
  },
  "streak": {
    "current": "{{count}} day streak",
    "best": "Best: {{count}} days"
  },
  "review": {
    "title": "{{date}}",
    "target": "Target",
    "actual": "Actual",
    "result": "Result",
    "todos": "Tasks",
    "noRecord": "No record"
  },
  "targetEdit": {
    "title": "Change wake time",
    "tomorrowOnly": "Tomorrow only",
    "changeDefault": "Change default",
    "save": "Save"
  },
  "enabled": "Alarm on",
  "disabled": "Alarm off"
}
```

`src/i18n/locales/ja/dashboard.json`:
```json
{
  "title": "ホーム",
  "tomorrowTarget": "明日のターゲット",
  "todayTarget": "今日のターゲット",
  "targetOff": "OFF",
  "override": "明日だけ",
  "todos": {
    "title": "朝のタスク",
    "addTask": "タスクを追加",
    "placeholder": "新しいタスク",
    "empty": "アラームが鳴ったときに完了するタスクを追加しましょう"
  },
  "week": {
    "title": "今週",
    "success": "{{count}}/{{total}} 成功"
  },
  "streak": {
    "current": "{{count}}日連続",
    "best": "最高: {{count}}日"
  },
  "review": {
    "title": "{{date}}",
    "target": "ターゲット",
    "actual": "実際",
    "result": "結果",
    "todos": "タスク",
    "noRecord": "記録なし"
  },
  "targetEdit": {
    "title": "起床時刻を変更",
    "tomorrowOnly": "明日だけ変更",
    "changeDefault": "デフォルトを変更",
    "save": "保存"
  },
  "enabled": "アラームON",
  "disabled": "アラームOFF"
}
```

**Step 3: Register namespaces in `src/i18n/index.ts`**

Add imports for onboarding and dashboard JSON files (both en and ja), then add them to the `resources` object:

```typescript
import onboardingEn from './locales/en/onboarding.json';
import dashboardEn from './locales/en/dashboard.json';
import onboardingJa from './locales/ja/onboarding.json';
import dashboardJa from './locales/ja/dashboard.json';

// In resources:
ja: { common: commonJa, alarm: alarmJa, wakeup: wakeupJa, stats: statsJa, onboarding: onboardingJa, dashboard: dashboardJa },
en: { common: commonEn, alarm: alarmEn, wakeup: wakeupEn, stats: statsEn, onboarding: onboardingEn, dashboard: dashboardEn },
```

**Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 5: Commit**

```bash
jj commit -m "feat: add i18n strings for onboarding and dashboard"
```

---

## Task 5: Onboarding Screen (Single Page Wizard)

**Files:**
- Create: `app/onboarding.tsx`
- Create: `src/components/onboarding/WelcomeStep.tsx`
- Create: `src/components/onboarding/TimeStep.tsx`
- Create: `src/components/onboarding/TodosStep.tsx`
- Create: `src/components/onboarding/PermissionStep.tsx`
- Create: `src/components/onboarding/DemoStep.tsx`

**Step 1: Create the step components**

Each step component receives props:
```typescript
interface StepProps {
  readonly onNext: () => void;
  readonly onBack: () => void;
}
```

`WelcomeStep` - App description + "Get Started" button.
`TimeStep` - Time picker for defaultTime. Uses local state, saves to wizard state via onNext.
`TodosStep` - Todo list editor with preset suggestions. Uses TextInput + add button.
`PermissionStep` - Calls `requestNotificationPermissions()`, auto-advances on grant.
`DemoStep` - Launches wakeup screen in demo mode or embeds a simplified demo inline.

The implementer should:
- Use `useTranslation('onboarding')` for all strings
- Use the existing theme constants (`colors`, `spacing`, `fontSize`)
- Keep the same dark theme as the rest of the app
- Use `Animated` or `LayoutAnimation` for step transitions

**Step 2: Create the onboarding page**

`app/onboarding.tsx`:
```typescript
// Single page, manages step state internally
// Holds wizard data: { defaultTime, todos }
// On final step completion:
//   1. Create WakeTarget via useWakeTargetStore.setTarget()
//   2. Schedule notifications
//   3. Set AsyncStorage 'onboarding-completed' = 'true'
//   4. router.replace('/')
```

Key implementation details:
- `useState<number>(0)` for current step index
- Steps array: [WelcomeStep, TimeStep, TodosStep, PermissionStep, DemoStep]
- Wizard data stored in `useRef` or `useState` at page level
- Pass data setter callbacks to each step
- Back button returns to previous step (except Welcome)
- Progress indicator at top (5 dots)

**Step 3: Run lint and typecheck**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 4: Commit**

```bash
jj commit -m "feat: add onboarding wizard with 5 steps"
```

---

## Task 6: Root Layout + Onboarding Routing

**Files:**
- Modify: `app/_layout.tsx`

**Step 1: Add onboarding check to RootLayout**

Update `app/_layout.tsx` to:
1. Check `AsyncStorage.getItem('onboarding-completed')` on mount
2. If not completed, redirect to `/onboarding`
3. Register `onboarding` as a Stack.Screen
4. Replace `alarm/create`, `alarm/[id]`, `wakeup/[id]` screen registrations
5. Add new screens: `target-edit`, `schedule`, `day-review`, `wakeup`
6. Update notification listener to route to `/wakeup` (no ID param)
7. Replace `useAlarmStore` references with `useWakeTargetStore`

Key changes:

```typescript
// Replace alarm store usage
const loadTarget = useWakeTargetStore((s) => s.loadTarget);
const resetTodos = useWakeTargetStore((s) => s.resetTodos);

// Onboarding check
const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

useEffect(() => {
  AsyncStorage.getItem('onboarding-completed').then((val) => {
    setOnboardingDone(val === 'true');
  });
}, []);

useEffect(() => {
  if (onboardingDone === false) {
    router.replace('/onboarding');
  }
}, [onboardingDone, router]);

// Notification handler - no alarm ID needed
const handleAlarmTrigger = () => {
  resetTodos();
  router.push('/wakeup');
};

// Stack screens
<Stack.Screen name="onboarding" options={{ headerShown: false }} />
<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
<Stack.Screen name="target-edit" options={{ presentation: 'modal', title: t('dashboard:targetEdit.title') }} />
<Stack.Screen name="schedule" options={{ presentation: 'modal', title: '...' }} />
<Stack.Screen name="day-review" options={{ presentation: 'modal', title: '...' }} />
<Stack.Screen name="wakeup" options={{ headerShown: false, gestureEnabled: false, presentation: 'fullScreenModal' }} />
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (may have warnings about unused old screens until they're deleted)

**Step 3: Commit**

```bash
jj commit -m "feat: update root layout for onboarding routing and WakeTarget"
```

---

## Task 7: Dashboard Home Screen

**Files:**
- Rewrite: `app/(tabs)/index.tsx` — from alarm list to dashboard
- Modify: `app/(tabs)/_layout.tsx` — remove stats tab, update icons/titles

**Step 1: Update tab layout**

`app/(tabs)/_layout.tsx` — Change from 3 tabs to 2 tabs:
- Home tab (index) with house icon
- Settings tab with gear icon
- Remove stats tab registration

**Step 2: Build the dashboard**

`app/(tabs)/index.tsx`:

The dashboard should contain these sections in a `ScrollView`:

1. **Target Time Display**
   - Large time text (fontSize.time or bigger)
   - Day label ("Tomorrow, Monday")
   - Shows override indicator if nextOverride is set
   - Pressable → navigates to `/target-edit`
   - Show "OFF" if the resolved time is null

2. **Todo List (inline editable)**
   - List of todos with checkboxes (display only, not functional on dashboard)
   - "+" button to add new todo (TextInput appears inline)
   - Swipe or X to delete
   - Reuse `TodoListItem` component in editable mode
   - Uses `useWakeTargetStore` addTodo/removeTodo

3. **Weekly Calendar**
   - Reuse/adapt existing `WeeklyCalendar` component
   - Each day is a colored dot: green (great/ok), yellow (late), red (missed), gray (no data)
   - Tapping a day → navigates to `/day-review?date=YYYY-MM-DD`

4. **Streak + Stats**
   - "X day streak" with fire icon
   - "Y/Z success this week"
   - Uses `useWakeRecordStore.getCurrentStreak()` and `getWeekStats()`

Use `useWakeTargetStore` for target data, `useWakeRecordStore` for history data.

Compute "tomorrow's time" using `resolveTimeForDate(target, tomorrowDate)`.

**Step 3: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 4: Commit**

```bash
jj commit -m "feat: build dashboard home screen with todo editing and weekly calendar"
```

---

## Task 8: Target Edit Modal + Day Review Modal

**Files:**
- Create: `app/target-edit.tsx`
- Create: `app/day-review.tsx`

**Step 1: Target Edit Modal**

`app/target-edit.tsx`:
- Time picker (hour/minute) pre-filled with current resolved time
- Radio selection: "Tomorrow only" vs "Change default"
- Save button:
  - If "tomorrow only" → `setNextOverride(time)`
  - If "change default" → `updateDefaultTime(time)`
- Reschedule notifications after save
- Close modal on save: `router.back()`

**Step 2: Day Review Modal**

`app/day-review.tsx`:
- Receives `?date=YYYY-MM-DD` search param
- Looks up `WakeRecord` for that date from `useWakeRecordStore`
- Displays:
  - Target time vs actual time
  - Result badge (great/ok/late/missed) with color
  - Todo list with completion status (checkmark or empty circle)
  - Time to complete all tasks
- If no record: show "No record" message

**Step 3: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 4: Commit**

```bash
jj commit -m "feat: add target-edit and day-review modals"
```

---

## Task 9: Wake-Up Flow Screen (Singleton)

**Files:**
- Create: `app/wakeup.tsx` (replaces `app/wakeup/[id].tsx`)
- Delete: `app/wakeup/[id].tsx`

**Step 1: Port the wakeup screen to singleton model**

`app/wakeup.tsx`:

Based on the existing `wakeup/[id].tsx`, but:
- No `id` param needed. Read target from `useWakeTargetStore`
- Replace `useAlarmStore` references with `useWakeTargetStore`
- `alarm.todos` → `target.todos`
- `alarm.time` → `resolveTimeForDate(target, new Date())`
- `toggleTodo(alarmId, todoId)` → `toggleTodoCompleted(todoId)`
- `areAllTodosCompleted(alarmId)` → `areAllTodosCompleted()`
- On dismiss: call `clearNextOverride()` to auto-clear one-time override
- Demo mode: check `useLocalSearchParams<{ demo?: string }>()`, if demo=true:
  - Play sound for 3 seconds only, then stop
  - Don't record WakeRecord
  - Show different dismiss text ("complete" button)
  - On dismiss: navigate to `/` (or back to onboarding completion)

Keep all existing UI: current time display, progress bar, todo list, dismiss button.

**Step 2: Delete the old wakeup screen**

Delete: `app/wakeup/[id].tsx` (and `app/wakeup/` directory if empty)

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
jj commit -m "feat: rewrite wakeup screen for singleton WakeTarget model"
```

---

## Task 10: Schedule Screen (Day Override Rules)

**Files:**
- Create: `app/schedule.tsx`

**Step 1: Build the schedule editor**

`app/schedule.tsx`:

- Displays default time at top
- Lists all 7 days of the week
- Each day shows: day name + resolved time (or "OFF")
- Days with overrides are highlighted
- Tapping a day → toggle between: use default / custom time / OFF
  - If custom time: show inline time picker
- Uses `useWakeTargetStore.setDayOverride()` and `removeDayOverride()`
- Save/close: `router.back()`
- Reschedule notifications on changes

**Step 2: Add navigation from settings**

In `app/(tabs)/settings.tsx`, add a "Schedule" row that navigates to `/schedule`.

**Step 3: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 4: Commit**

```bash
jj commit -m "feat: add schedule screen for day override rules"
```

---

## Task 11: Settings Screen Update

**Files:**
- Modify: `app/(tabs)/settings.tsx`

**Step 1: Update settings content**

Settings screen should now contain:
- **Schedule** - Navigate to `/schedule` for weekday rules
- **Alarm toggle** - ON/OFF switch using `useWakeTargetStore.toggleEnabled()`
- **Notification status** - Show current permission status
- **About** - Version info (keep existing)

Remove references to old alarm model.

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
jj commit -m "feat: update settings screen for WakeTarget model"
```

---

## Task 12: Clean Up Old Code

**Files:**
- Delete: `app/alarm/create.tsx`
- Delete: `app/alarm/[id].tsx`
- Delete: `app/alarm/` directory
- Delete: `app/(tabs)/stats.tsx`
- Delete: `app/wakeup/` directory (if not already deleted)
- Delete: `src/components/AlarmCard.tsx`
- Modify: `src/stores/alarm-store.ts` — keep for migration or delete if not needed
- Clean up unused imports in remaining files

**Step 1: Delete old files**

Remove all files listed above.

**Step 2: Remove unused alarm-store exports**

If alarm-store is no longer imported anywhere, delete `src/stores/alarm-store.ts`.
If it's needed for data migration, keep it but mark as deprecated.

**Step 3: Clean up old i18n keys**

Check if `alarm.json` keys are still used by remaining code. Remove unused keys.
The `stats.json` namespace may still be partially used by dashboard — check before removing.

**Step 4: Run full checks**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: All PASS. Fix any broken tests or imports.

**Step 5: Commit**

```bash
jj commit -m "chore: remove old alarm list code and unused files"
```

---

## Task 13: Update Existing Tests

**Files:**
- Modify: `src/__tests__/alarm-store.test.ts` — remove or update
- Modify: `src/__tests__/alarm-types.test.ts` — keep tests for shared types (AlarmTime, etc.)
- Keep: `src/__tests__/wake-record-store.test.ts` and `wake-record-types.test.ts` — should still pass

**Step 1: Update alarm-store tests**

If alarm-store was deleted, delete `alarm-store.test.ts`.
If kept for migration, update tests accordingly.

**Step 2: Update alarm-types tests**

Keep tests for `formatTime`, `createTodoId`, `getDayLabel` — these types are still used.
Remove tests for `formatRepeatDays`, `createAlarmId` if those functions are no longer exported.

**Step 3: Run all tests**

Run: `pnpm test`
Expected: All PASS

**Step 4: Commit**

```bash
jj commit -m "test: update test suite for WakeTarget model"
```

---

## Task 14: Final Integration and Typecheck

**Step 1: Full verification**

Run all checks:
```bash
pnpm typecheck
pnpm lint
pnpm test
```

**Step 2: Manual smoke test checklist**

- [ ] Fresh install → onboarding wizard appears
- [ ] Set time + todos → completes wizard
- [ ] Demo experience works (sound plays briefly, todos checkable)
- [ ] Dashboard shows tomorrow's target and todo list
- [ ] Tap time → target-edit modal opens
- [ ] Set "tomorrow only" override → dashboard shows override indicator
- [ ] Edit todos inline on dashboard (add/remove)
- [ ] Weekly calendar shows past records
- [ ] Tap calendar day → day-review modal with todo details
- [ ] Streak counter works
- [ ] Settings → Schedule → edit day overrides
- [ ] Alarm fires → wakeup screen → complete todos → dismiss
- [ ] After dismiss, nextOverride is cleared

**Step 3: Commit**

```bash
jj commit -m "chore: final integration verification"
```
