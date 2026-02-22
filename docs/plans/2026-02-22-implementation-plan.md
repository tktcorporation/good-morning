# Feature Modernization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add i18n (ja/en), wake-up record tracking with Stats tab, and HealthKit sleep data integration to enable PDCA-based improvement of wake-up behavior.

**Architecture:** 3 phases built incrementally. Phase 1 adds i18n infrastructure and converts all hardcoded strings. Phase 2 adds WakeRecord data model, recording logic in the dismiss flow, and a new Stats tab with weekly summary/calendar/streak. Phase 3 integrates HealthKit sleep data to compare target vs actual wake times.

**Tech Stack:** i18next + react-i18next + expo-localization (i18n), react-native-health (HealthKit), Zustand + AsyncStorage (state/persistence), Biome noJsxLiterals (lint enforcement)

---

## Phase 1: i18n (Internationalization)

### Task 1: Install i18n dependencies

**Step 1: Install packages**

Run: `pnpm add i18next react-i18next expo-localization`

**Step 2: Verify installation**

Run: `pnpm typecheck`
Expected: PASS (no new type errors)

**Step 3: Commit**

Run: `jj commit -m "chore: add i18next, react-i18next, expo-localization"`

---

### Task 2: Create i18n infrastructure

**Files:**
- Create: `src/i18n/index.ts`
- Create: `src/i18n/i18next.d.ts`
- Create: `src/i18n/locales/ja/common.json`
- Create: `src/i18n/locales/ja/alarm.json`
- Create: `src/i18n/locales/ja/wakeup.json`
- Create: `src/i18n/locales/en/common.json`
- Create: `src/i18n/locales/en/alarm.json`
- Create: `src/i18n/locales/en/wakeup.json`

**Step 1: Create Japanese translation files**

`src/i18n/locales/ja/common.json`:
```json
{
  "loading": "読み込み中...",
  "save": "保存",
  "cancel": "キャンセル",
  "delete": "削除",
  "goBack": "戻る",
  "days": {
    "sun": "日",
    "mon": "月",
    "tue": "火",
    "wed": "水",
    "thu": "木",
    "fri": "金",
    "sat": "土"
  },
  "dayLabelsShort": {
    "0": "日",
    "1": "月",
    "2": "火",
    "3": "水",
    "4": "木",
    "5": "金",
    "6": "土"
  },
  "repeat": {
    "once": "1回のみ",
    "everyDay": "毎日",
    "weekdays": "平日",
    "weekends": "週末"
  }
}
```

`src/i18n/locales/ja/alarm.json`:
```json
{
  "title": "アラーム",
  "newAlarm": "新規アラーム",
  "editAlarm": "アラーム編集",
  "noAlarms": "アラームがありません",
  "noAlarmsHint": "+ をタップして最初のアラームを作成しましょう",
  "label": "ラベル",
  "labelPlaceholder": "アラーム名（任意）",
  "repeat": "繰り返し",
  "tasks": "起床タスク",
  "tasksDescription": "アラームを解除するにはすべてのタスクを完了する必要があります。",
  "taskPlaceholder": "タスクの内容...",
  "addTask": "追加",
  "saveAlarm": "アラームを保存",
  "saveChanges": "変更を保存",
  "deleteAlarm": "アラームを削除",
  "deleteConfirmTitle": "アラームの削除",
  "deleteConfirmMessage": "このアラームを削除してもよろしいですか？",
  "addTasksTitle": "タスクを追加",
  "addTasksMessage": "アラーム発動時に完了するタスクを1つ以上追加してください。",
  "tasksToComplete": "{{count}}個のタスク",
  "notification": {
    "title": "おはようございます！",
    "defaultBody": "起きる時間です！"
  }
}
```

`src/i18n/locales/ja/wakeup.json`:
```json
{
  "alarmPrefix": "アラーム: {{time}}",
  "progress": "{{completed}} / {{total}} タスク完了",
  "statusIncomplete": "すべてのタスクを完了してアラームを解除してください。",
  "statusComplete": "すべてのタスクが完了しました！アラームを解除できます。",
  "dismissAlarm": "アラームを解除",
  "completeAllTasks": "すべてのタスクを完了",
  "alarmNotFound": "アラームが見つかりません"
}
```

`src/i18n/locales/en/common.json`:
```json
{
  "loading": "Loading...",
  "save": "Save",
  "cancel": "Cancel",
  "delete": "Delete",
  "goBack": "Go Back",
  "days": {
    "sun": "Sun",
    "mon": "Mon",
    "tue": "Tue",
    "wed": "Wed",
    "thu": "Thu",
    "fri": "Fri",
    "sat": "Sat"
  },
  "dayLabelsShort": {
    "0": "Sun",
    "1": "Mon",
    "2": "Tue",
    "3": "Wed",
    "4": "Thu",
    "5": "Fri",
    "6": "Sat"
  },
  "repeat": {
    "once": "Once",
    "everyDay": "Every day",
    "weekdays": "Weekdays",
    "weekends": "Weekends"
  }
}
```

`src/i18n/locales/en/alarm.json`:
```json
{
  "title": "Alarms",
  "newAlarm": "New Alarm",
  "editAlarm": "Edit Alarm",
  "noAlarms": "No alarms yet",
  "noAlarmsHint": "Tap + to create your first alarm",
  "label": "Label",
  "labelPlaceholder": "Alarm label (optional)",
  "repeat": "Repeat",
  "tasks": "Wake-up Tasks",
  "tasksDescription": "You must complete all tasks to dismiss the alarm.",
  "taskPlaceholder": "Task description...",
  "addTask": "+ Add",
  "saveAlarm": "Save Alarm",
  "saveChanges": "Save Changes",
  "deleteAlarm": "Delete Alarm",
  "deleteConfirmTitle": "Delete Alarm",
  "deleteConfirmMessage": "Are you sure you want to delete this alarm?",
  "addTasksTitle": "Add Tasks",
  "addTasksMessage": "Add at least one task to complete when the alarm rings.",
  "tasksToComplete": "{{count}} task(s) to complete",
  "notification": {
    "title": "Good Morning!",
    "defaultBody": "Time to wake up!"
  }
}
```

`src/i18n/locales/en/wakeup.json`:
```json
{
  "alarmPrefix": "Alarm: {{time}}",
  "progress": "{{completed}} / {{total}} tasks completed",
  "statusIncomplete": "Complete all tasks to dismiss the alarm.",
  "statusComplete": "All tasks completed! You can dismiss the alarm.",
  "dismissAlarm": "Dismiss Alarm",
  "completeAllTasks": "Complete All Tasks",
  "alarmNotFound": "Alarm not found"
}
```

**Step 2: Create i18n initialization**

`src/i18n/index.ts`:
```typescript
import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import alarmEn from './locales/en/alarm.json';
import commonEn from './locales/en/common.json';
import wakeupEn from './locales/en/wakeup.json';
import alarmJa from './locales/ja/alarm.json';
import commonJa from './locales/ja/common.json';
import wakeupJa from './locales/ja/wakeup.json';

const SUPPORTED_LANGUAGES = ['ja', 'en'] as const;
const DEFAULT_LANGUAGE = 'ja';

function getDeviceLanguage(): string {
  const locales = Localization.getLocales();
  const deviceLang = locales[0]?.languageCode ?? DEFAULT_LANGUAGE;
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(deviceLang)
    ? deviceLang
    : DEFAULT_LANGUAGE;
}

i18n.use(initReactI18next).init({
  lng: getDeviceLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: 'common',
  resources: {
    ja: { common: commonJa, alarm: alarmJa, wakeup: wakeupJa },
    en: { common: commonEn, alarm: alarmEn, wakeup: wakeupEn },
  },
  interpolation: { escapeValue: false },
});

export default i18n;
```

**Step 3: Create type definitions**

`src/i18n/i18next.d.ts`:
```typescript
import 'i18next';
import type alarmJa from './locales/ja/alarm.json';
import type commonJa from './locales/ja/common.json';
import type wakeupJa from './locales/ja/wakeup.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof commonJa;
      alarm: typeof alarmJa;
      wakeup: typeof wakeupJa;
    };
  }
}
```

**Step 4: Verify**

Run: `pnpm typecheck`
Expected: PASS

**Step 5: Commit**

Run: `jj commit -m "feat: add i18n infrastructure with ja/en translations"`

---

### Task 3: Import i18n in root layout

**Files:**
- Modify: `app/_layout.tsx`

**Step 1: Add i18n import at top of file**

Add `import '../src/i18n';` as the first import in `app/_layout.tsx`.

**Step 2: Verify**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

Run: `jj commit -m "feat: initialize i18n in root layout"`

---

### Task 4: Convert alarm types to use i18n

**Files:**
- Modify: `src/types/alarm.ts`

**Step 1: Write failing test**

Add to `src/__tests__/alarm-types.test.ts`:
```typescript
// At top: import i18n
import '../i18n';

// Replace existing formatRepeatDays tests to verify i18n integration
// The function should use translation keys instead of hardcoded English strings
```

Note: `DAY_LABELS` and `formatRepeatDays` currently return hardcoded English. These need to accept a translation function parameter, OR we move the display logic to components. The cleaner approach is:

- Keep `DAY_LABELS` as a mapping from DayOfWeek to translation key
- `formatRepeatDays` accepts a `t` function parameter
- Components call `formatRepeatDays(days, t)` with their `useTranslation` hook

**Step 2: Update `src/types/alarm.ts`**

Replace `DAY_LABELS` with a key-based approach:
```typescript
export const DAY_KEYS: Readonly<Record<DayOfWeek, string>> = {
  0: '0', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6',
} as const;

export function getDayLabel(day: DayOfWeek, t: (key: string) => string): string {
  return t(`dayLabelsShort.${DAY_KEYS[day]}`);
}

export function formatRepeatDays(
  days: readonly DayOfWeek[],
  t: (key: string) => string,
): string {
  if (days.length === 0) return t('repeat.once');
  if (days.length === 7) return t('repeat.everyDay');
  const weekdays: readonly DayOfWeek[] = [1, 2, 3, 4, 5];
  const weekend: readonly DayOfWeek[] = [0, 6];
  if (weekdays.every((d) => days.includes(d)) && !weekend.some((d) => days.includes(d))) {
    return t('repeat.weekdays');
  }
  if (weekend.every((d) => days.includes(d)) && !weekdays.some((d) => days.includes(d))) {
    return t('repeat.weekends');
  }
  return days.map((d) => getDayLabel(d, t)).join(', ');
}
```

**Step 3: Update tests to pass `t` function**

Update `src/__tests__/alarm-types.test.ts` to provide a mock `t` function or import i18n. Use a simple mock that returns the key for testing.

**Step 4: Update all callers of `formatRepeatDays` and `DAY_LABELS`**

Files that import these:
- `src/components/AlarmCard.tsx` — calls `formatRepeatDays(alarm.repeatDays)` → add `t` from `useTranslation('common')`
- `src/components/DaySelector.tsx` — uses `DAY_LABELS[day]` → use `getDayLabel(day, t)`
- Any alarm create/edit screens using these

**Step 5: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: PASS

**Step 6: Commit**

Run: `jj commit -m "refactor: make DAY_LABELS and formatRepeatDays i18n-aware"`

---

### Task 5: Convert all screens to use i18n

**Files (modify each to use `useTranslation`):**
- `app/(tabs)/index.tsx` — namespace `alarm`
- `app/(tabs)/settings.tsx` — namespace `common`
- `app/(tabs)/_layout.tsx` — namespace `alarm` + `common`
- `app/alarm/create.tsx` — namespace `alarm`
- `app/alarm/[id].tsx` — namespace `alarm`
- `app/wakeup/[id].tsx` — namespace `wakeup`
- `app/_layout.tsx` — namespace `alarm` (screen titles)
- `src/components/AlarmCard.tsx` — namespace `alarm`
- `src/services/notifications.ts` — namespace `alarm` (notification content)

For each file:
1. Add `import { useTranslation } from 'react-i18next';`
2. Add `const { t } = useTranslation('namespace');` inside the component
3. Replace every hardcoded string with `t('key')`
4. For `notifications.ts` (not a component), import `i18n` directly: `import i18n from '@/i18n'; i18n.t('alarm:notification.title')`

**Conversion pattern for each screen (same for all):**

Before: `<Text>No alarms yet</Text>`
After: `<Text>{t('noAlarms')}</Text>`

Before: `<Text>Tap + to create your first alarm</Text>`
After: `<Text>{t('noAlarmsHint')}</Text>`

Before: `title: 'New Alarm'` (in Stack.Screen options)
After: Use i18n in _layout.tsx or pass via screenOptions

**Step by step:**
1. Convert `app/(tabs)/index.tsx` and `src/components/AlarmCard.tsx`
2. Convert `app/alarm/create.tsx` and `app/alarm/[id].tsx`
3. Convert `app/wakeup/[id].tsx`
4. Convert `app/_layout.tsx` and `app/(tabs)/_layout.tsx`
5. Convert `app/(tabs)/settings.tsx`
6. Convert `src/services/notifications.ts`

After each file conversion, run `pnpm typecheck` to catch type errors.

**Commit after each group:**

Run: `jj commit -m "feat(i18n): convert alarm list and card to i18n"`
Run: `jj commit -m "feat(i18n): convert alarm create/edit screens to i18n"`
Run: `jj commit -m "feat(i18n): convert wakeup screen to i18n"`
Run: `jj commit -m "feat(i18n): convert layouts and settings to i18n"`
Run: `jj commit -m "feat(i18n): convert notification service to i18n"`

---

### Task 6: Add Biome noJsxLiterals lint rule

**Files:**
- Modify: `biome.json`

**Step 1: Add rule to biome.json**

In `linter.rules.style`, add:
```json
"noJsxLiterals": "error"
```

**Step 2: Run lint to verify no violations**

Run: `pnpm lint`
Expected: PASS (no new errors — all strings should be converted by now)

If there are violations, fix them by replacing remaining hardcoded strings with `t()` calls.

**Step 3: Commit**

Run: `jj commit -m "feat(i18n): add noJsxLiterals biome rule to enforce i18n"`

---

### Task 7: Update tests for i18n

**Files:**
- Modify: `src/__tests__/alarm-types.test.ts`
- Modify: `src/__tests__/alarm-store.test.ts`

**Step 1: Ensure tests still pass with i18n changes**

The alarm-store tests should be unaffected (they test store logic, not UI strings).
The alarm-types tests need updating for `formatRepeatDays(days, t)` signature change.

**Step 2: Run full test suite**

Run: `pnpm test`
Expected: PASS

**Step 3: Commit**

Run: `jj commit -m "test: update tests for i18n compatibility"`

---

## Phase 2: Wake Record + Stats Tab

### Task 8: Create WakeRecord type definitions

**Files:**
- Create: `src/types/wake-record.ts`

**Step 1: Write test**

Create `src/__tests__/wake-record-types.test.ts`:
```typescript
import { calculateWakeResult, createWakeRecordId } from '../types/wake-record';

describe('createWakeRecordId', () => {
  it('generates unique IDs starting with "wake_"', () => {
    const id1 = createWakeRecordId();
    const id2 = createWakeRecordId();
    expect(id1.startsWith('wake_')).toBe(true);
    expect(id1).not.toBe(id2);
  });
});

describe('calculateWakeResult', () => {
  it('returns "great" when within 5 minutes of target', () => {
    expect(calculateWakeResult(3)).toBe('great');
    expect(calculateWakeResult(-3)).toBe('great');
    expect(calculateWakeResult(0)).toBe('great');
  });

  it('returns "ok" when 5-15 minutes late', () => {
    expect(calculateWakeResult(6)).toBe('ok');
    expect(calculateWakeResult(15)).toBe('ok');
  });

  it('returns "late" when more than 15 minutes late', () => {
    expect(calculateWakeResult(16)).toBe('late');
    expect(calculateWakeResult(60)).toBe('late');
  });

  it('returns "great" when early (negative diff)', () => {
    expect(calculateWakeResult(-10)).toBe('great');
    expect(calculateWakeResult(-30)).toBe('great');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --testPathPattern wake-record`
Expected: FAIL (module not found)

**Step 3: Create `src/types/wake-record.ts`**

```typescript
import type { AlarmTime } from './alarm';

export type WakeResult = 'great' | 'ok' | 'late' | 'missed';

export interface WakeTodoRecord {
  readonly id: string;
  readonly title: string;
  readonly completedAt: string | null;
  readonly orderCompleted: number | null;
}

export interface WakeRecord {
  readonly id: string;
  readonly alarmId: string;
  readonly date: string; // YYYY-MM-DD

  readonly targetTime: AlarmTime;
  readonly alarmTriggeredAt: string; // ISO datetime
  readonly dismissedAt: string; // ISO datetime
  readonly healthKitWakeTime: string | null; // ISO datetime (Phase 3)

  readonly result: WakeResult;
  readonly diffMinutes: number; // positive = late, negative = early

  readonly todos: readonly WakeTodoRecord[];
  readonly todoCompletionSeconds: number;
  readonly alarmLabel: string;
}

export interface WakeStats {
  readonly successRate: number; // 0-100
  readonly averageDiffMinutes: number;
  readonly currentStreak: number;
  readonly longestStreak: number;
  readonly totalRecords: number;
  readonly resultCounts: Record<WakeResult, number>;
}

export function createWakeRecordId(): string {
  return `wake_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function calculateWakeResult(diffMinutes: number): WakeResult {
  if (diffMinutes <= 5) return 'great';
  if (diffMinutes <= 15) return 'ok';
  return 'late';
}

export function calculateDiffMinutes(
  targetTime: AlarmTime,
  actualTime: Date,
): number {
  const targetMinutes = targetTime.hour * 60 + targetTime.minute;
  const actualMinutes = actualTime.getHours() * 60 + actualTime.getMinutes();
  return actualMinutes - targetMinutes;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --testPathPattern wake-record`
Expected: PASS

**Step 5: Commit**

Run: `jj commit -m "feat: add WakeRecord type definitions and helpers"`

---

### Task 9: Create wake-record store

**Files:**
- Create: `src/stores/wake-record-store.ts`
- Create: `src/__tests__/wake-record-store.test.ts`

**Step 1: Write tests**

```typescript
// src/__tests__/wake-record-store.test.ts
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
    { id: 'todo_1', title: 'Drink water', completedAt: '2026-02-22T07:01:00.000Z', orderCompleted: 1 },
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
    // Add 3 consecutive "great" days
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
```

**Step 2: Implement store**

`src/stores/wake-record-store.ts`:
Same pattern as `alarm-store.ts` — Zustand + AsyncStorage persistence. Key methods: `loadRecords`, `addRecord`, `getRecordsForPeriod`, `getWeekStats`, `getCurrentStreak`.

**Step 3: Run tests**

Run: `pnpm test -- --testPathPattern wake-record-store`
Expected: PASS

**Step 4: Commit**

Run: `jj commit -m "feat: add wake-record store with stats calculation"`

---

### Task 10: Record wake data on alarm dismiss

**Files:**
- Modify: `app/wakeup/[id].tsx`

**Step 1: Add recording logic to handleDismiss**

In `app/wakeup/[id].tsx`:
- Track `mountedAt` (useRef for when screen mounted = alarm triggered time)
- Track todo completion timestamps (enhance toggleTodo handler)
- In `handleDismiss`, create a WakeRecord and call `addRecord`
- Calculate `diffMinutes` from alarm target time vs dismiss time
- Calculate `result` using `calculateWakeResult`
- Calculate `todoCompletionSeconds` from mountedAt to last todo completion

**Step 2: Verify**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

Run: `jj commit -m "feat: record wake data when alarm is dismissed"`

---

### Task 11: Add Stats tab

**Files:**
- Create: `app/(tabs)/stats.tsx`
- Modify: `app/(tabs)/_layout.tsx`

**Step 1: Create Stats screen placeholder**

`app/(tabs)/stats.tsx`:
Basic screen structure with `useWakeRecordStore` and `useTranslation('stats')`. Shows "No data yet" if no records.

**Step 2: Add Stats tab to layout**

In `app/(tabs)/_layout.tsx`, add between Alarms and Settings:
```tsx
<Tabs.Screen
  name="stats"
  options={{
    title: t('stats:title'),
    tabBarIcon: ({ focused }) => <TabIcon label="📊" focused={focused} />,
  }}
/>
```

**Step 3: Add stats translations**

Create `src/i18n/locales/ja/stats.json`:
```json
{
  "title": "統計",
  "noData": "まだデータがありません",
  "noDataHint": "アラームを解除すると起床記録が蓄積されます",
  "thisWeek": "今週",
  "successRate": "起床成功率",
  "avgWakeTime": "平均起床時間",
  "avgDiff": "平均差分",
  "streak": "連続成功",
  "longestStreak": "最長記録",
  "days": "日",
  "minutesLate": "+{{count}}分",
  "minutesEarly": "-{{count}}分",
  "onTime": "時間通り",
  "weekOf": "{{date}} の週",
  "great": "成功",
  "ok": "まあまあ",
  "late": "遅刻",
  "missed": "未起床"
}
```

Create `src/i18n/locales/en/stats.json`:
```json
{
  "title": "Stats",
  "noData": "No data yet",
  "noDataHint": "Dismiss alarms to start tracking your wake-up patterns",
  "thisWeek": "This Week",
  "successRate": "Success Rate",
  "avgWakeTime": "Avg Wake Time",
  "avgDiff": "Avg Difference",
  "streak": "Streak",
  "longestStreak": "Longest",
  "days": "days",
  "minutesLate": "+{{count}}min",
  "minutesEarly": "-{{count}}min",
  "onTime": "On time",
  "weekOf": "Week of {{date}}",
  "great": "Great",
  "ok": "OK",
  "late": "Late",
  "missed": "Missed"
}
```

Update `src/i18n/index.ts` and `src/i18n/i18next.d.ts` to include the stats namespace.

**Step 4: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 5: Commit**

Run: `jj commit -m "feat: add Stats tab with empty state"`

---

### Task 12: Build Stats screen - Summary Cards

**Files:**
- Create: `src/components/stats/SummaryCards.tsx`
- Modify: `app/(tabs)/stats.tsx`

**Step 1: Create SummaryCards component**

Displays 3 cards in a row:
1. Success rate (%) with color
2. Average wake time
3. Current streak (days)

Uses `WakeStats` from the store. Follows existing theme (dark bg, card surfaces).

**Step 2: Integrate into Stats screen**

**Step 3: Commit**

Run: `jj commit -m "feat: add summary cards to Stats screen"`

---

### Task 13: Build Stats screen - Weekly Calendar

**Files:**
- Create: `src/components/stats/WeeklyCalendar.tsx`
- Modify: `app/(tabs)/stats.tsx`

**Step 1: Create WeeklyCalendar component**

Shows Mon-Sun with colored dots based on WakeResult:
- great = success green
- ok = warning orange
- late = primary red
- missed/no data = muted gray

Horizontal swipe to navigate weeks. Tap a day to show details (time, diff, todos).

**Step 2: Integrate into Stats screen**

**Step 3: Commit**

Run: `jj commit -m "feat: add weekly calendar to Stats screen"`

---

### Task 14: Build Stats screen - Streak Display

**Files:**
- Create: `src/components/stats/StreakDisplay.tsx`
- Modify: `app/(tabs)/stats.tsx`

**Step 1: Create StreakDisplay component**

Shows current streak count prominently with longest streak below.

**Step 2: Commit**

Run: `jj commit -m "feat: add streak display to Stats screen"`

---

### Task 15: Load wake records on app start

**Files:**
- Modify: `app/_layout.tsx`

**Step 1: Add wake record store initialization**

In `app/_layout.tsx` useEffect, call `loadWakeRecords()` alongside `loadAlarms()`.

**Step 2: Commit**

Run: `jj commit -m "feat: load wake records on app start"`

---

## Phase 3: HealthKit Integration

### Task 16: Install react-native-health

**Step 1: Install**

Run: `pnpm add react-native-health`

**Step 2: Add Config Plugin to app.json or app.config**

Add to the plugins array:
```json
["react-native-health", {
  "healthSharePermission": "Good Morning はあなたの睡眠データを読み取り、起床パターンを分析します"
}]
```

**Step 3: Commit**

Run: `jj commit -m "chore: add react-native-health with Config Plugin"`

---

### Task 17: Create health service

**Files:**
- Create: `src/services/health.ts`

**Step 1: Create health service**

`src/services/health.ts`:
- `initHealthKit()` — request read permission for SleepAnalysis
- `getSleepSummary(date: Date)` — query INBED samples, calculate bedtime/wakeUpTime
- Returns `SleepSummary | null` (null if no data)
- Wrap callback API in Promises

**Step 2: Commit**

Run: `jj commit -m "feat: add HealthKit sleep data service"`

---

### Task 18: Integrate HealthKit with wake record

**Files:**
- Modify: `app/wakeup/[id].tsx`
- Modify: `app/(tabs)/stats.tsx`

**Step 1: On dismiss, attempt to fetch HealthKit wake time**

In the dismiss handler (after recording the basic WakeRecord), try fetching HealthKit data. If available, update the record's `healthKitWakeTime` and recalculate `result`/`diffMinutes` using the HealthKit wake time instead of the dismiss time.

**Step 2: Show HealthKit data in Stats**

In the weekly calendar day detail, show "HealthKit wake time" vs "Dismiss time" if both available.

**Step 3: Commit**

Run: `jj commit -m "feat: integrate HealthKit sleep data with wake records"`

---

### Task 19: HealthKit permission request flow

**Files:**
- Modify: `app/(tabs)/stats.tsx` or `app/_layout.tsx`

**Step 1: Add HealthKit permission request**

Request on Stats tab first visit. Show banner if HealthKit data unavailable: "Connect Health to see accurate sleep data."

**Step 2: Add translations for HealthKit UI**

Add to stats.json (ja/en):
```json
"healthKit": {
  "connect": "ヘルスケアと連携",
  "noData": "睡眠データが見つかりません",
  "noDataHint": "ヘルスケアアプリで権限を確認してください"
}
```

**Step 3: Commit**

Run: `jj commit -m "feat: add HealthKit permission request and fallback UI"`

---

### Task 20: Final verification

**Step 1: Run all checks**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: ALL PASS

**Step 2: Verify i18n coverage**

Run: `pnpm lint` — noJsxLiterals rule should catch any remaining hardcoded strings.

**Step 3: Final commit if needed**

Run: `jj commit -m "chore: final cleanup and verification"`
