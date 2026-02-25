# Snooze + Live Activity + Notification Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** TODO全完了まで9分間隔でスヌーズを繰り返し、Live Activityで進捗+カウントダウンを表示し、レガシー通知コードを削除する。

**Architecture:** `expo-alarm-kit` の既存スヌーズ機能（`doSnoozeIntent` + `snoozeDuration`）を活用してスヌーズを実現。Live Activity は `expo-alarm-kit` ネイティブモジュール (Swift) に ActivityKit 連携を追加し、iOS Widget Extension で UI を定義。レガシーの `expo-notifications` ベースのアラームリスナーを削除し AlarmKit に一本化。

**Tech Stack:** Expo SDK 54, React Native 0.81, TypeScript, Zustand, Swift (ActivityKit/WidgetKit), expo-alarm-kit

**Design Doc:** `docs/plans/2026-02-25-snooze-live-activity-design.md`

---

## Phase 1: Legacy Notification Cleanup

### Task 1: Delete notification test file

**Files:**
- Delete: `src/__tests__/notifications.test.ts`

**Step 1: Delete the test file**

```bash
rm src/__tests__/notifications.test.ts
```

**Step 2: Run tests to verify nothing breaks**

Run: `pnpm test`
Expected: All remaining tests PASS

**Step 3: Commit**

```bash
jj commit -m "test: remove notifications test file (legacy cleanup)"
```

### Task 2: Remove notification service

**Files:**
- Delete: `src/services/notifications.ts`
- Modify: `app/_layout.tsx`

**Step 1: Delete the notification service file**

```bash
rm src/services/notifications.ts
```

**Step 2: Remove notification imports and usage from `app/_layout.tsx`**

Remove these imports (lines 15-18):
```typescript
import {
  addNotificationReceivedListener,
  addNotificationResponseListener,
  requestNotificationPermissions,
} from '../src/services/notifications';
```

Remove `requestNotificationPermissions()` call from the initialization effect (line 46).

Remove the entire notification listener effect (lines 81-119):
```typescript
  useEffect(() => {
    const VIBRATION_PATTERN = [500, 1000, 500, 1000];
    const handleAlarmTrigger = () => { ... };
    const responseSub = addNotificationResponseListener(handleAlarmTrigger);
    const receivedSub = addNotificationReceivedListener(handleAlarmTrigger);
    return () => {
      responseSub.remove();
      receivedSub.remove();
    };
  }, [router, resetTodos, updateRecord, clearSession]);
```

Also remove now-unused imports/state that were only used by that effect:
- `Vibration` from `react-native`
- `playAlarmSound` from `../src/services/sound`
- `updateRecord` from `useWakeRecordStore`
- `clearSession` from `useMorningSessionStore`
- `resetTodos` from `useWakeTargetStore`

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 4: Run tests**

Run: `pnpm test`
Expected: All tests PASS

**Step 5: Commit**

```bash
jj commit -m "refactor: remove legacy expo-notifications alarm handling"
```

### Task 3: Remove legacy `Alarm` type and notification ID migration

**Files:**
- Modify: `src/types/alarm.ts` — remove `Alarm` interface, `AlarmFormData` interface, `createAlarmId` function
- Modify: `src/stores/wake-target-store.ts` — remove `LEGACY_NOTIFICATION_IDS_KEY` and fallback logic
- Modify: `src/__tests__/wake-target-store.test.ts` — remove legacy fallback test

**Step 1: Write a test to verify loadTarget works without legacy key**

In `src/__tests__/wake-target-store.test.ts`, verify the existing `loadTarget loads alarmIds` test still passes, then remove the test at line 159 (`loadTarget falls back to legacy notification-ids key`).

**Step 2: Remove `LEGACY_NOTIFICATION_IDS_KEY` from store**

In `src/stores/wake-target-store.ts`:
- Remove line 11: `const LEGACY_NOTIFICATION_IDS_KEY = 'notification-ids';`
- In `loadTarget`, remove `rawLegacyIds` from the `Promise.all` (line 48) and the fallback logic (lines 53-54).

Before:
```typescript
const [raw, rawIds, rawLegacyIds] = await Promise.all([
  AsyncStorage.getItem(STORAGE_KEY),
  AsyncStorage.getItem(ALARM_IDS_KEY),
  AsyncStorage.getItem(LEGACY_NOTIFICATION_IDS_KEY),
]);
const alarmIds: readonly string[] =
  rawIds !== null
    ? (JSON.parse(rawIds) as string[])
    : rawLegacyIds !== null
      ? (JSON.parse(rawLegacyIds) as string[])
      : [];
```

After:
```typescript
const [raw, rawIds] = await Promise.all([
  AsyncStorage.getItem(STORAGE_KEY),
  AsyncStorage.getItem(ALARM_IDS_KEY),
]);
const alarmIds: readonly string[] =
  rawIds !== null ? (JSON.parse(rawIds) as string[]) : [];
```

**Step 3: Remove legacy types from `src/types/alarm.ts`**

Remove the `Alarm` interface (lines 30-38), `AlarmFormData` interface (lines 40-45), and `createAlarmId` function (lines 47-49). Keep `TodoItem`, `AlarmTime`, `DayOfWeek`, `createTodoId`, `formatTime`, `formatRepeatDays`, `getDayLabel`.

**Step 4: Verify no references remain**

Run: `pnpm typecheck`
Expected: No errors (if anything references removed types, fix it)

**Step 5: Run tests**

Run: `pnpm test`
Expected: All tests PASS

**Step 6: Commit**

```bash
jj commit -m "refactor: remove legacy Alarm type and notification-ids migration"
```

---

## Phase 2: Snooze Integration

### Task 4: Add snooze scheduling to `alarm-kit.ts` service

**Files:**
- Modify: `src/services/alarm-kit.ts`
- Test: `src/__tests__/alarm-kit.test.ts`

**Step 1: Write failing tests for snooze functions**

Add to `src/__tests__/alarm-kit.test.ts`:

```typescript
import {
  // ... existing imports ...
  scheduleSnooze,
  cancelSnooze,
  SNOOZE_DURATION_SECONDS,
} from '../services/alarm-kit';

describe('scheduleSnooze', () => {
  test('schedules a one-time alarm with snooze payload', async () => {
    mockGenerateUUID.mockReturnValue('snooze-uuid-1');
    mockScheduleAlarm.mockResolvedValue(true);

    const result = await scheduleSnooze();
    expect(result).toBe('snooze-uuid-1');
    expect(mockScheduleAlarm).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'snooze-uuid-1',
        title: 'Good Morning',
        launchAppOnDismiss: true,
        dismissPayload: '{"isSnooze":true}',
      }),
    );
  });

  test('returns null when AlarmKit is unavailable', async () => {
    // This test depends on how you mock getAlarmKit returning null
    // For the mock-based approach: make scheduleAlarm throw
    mockScheduleAlarm.mockRejectedValue(new Error('unavailable'));
    const result = await scheduleSnooze();
    expect(result).toBeNull();
  });
});

describe('cancelSnooze', () => {
  test('cancels the alarm by id', async () => {
    mockCancelAlarm.mockResolvedValue(true);
    await cancelSnooze('snooze-uuid-1');
    expect(mockCancelAlarm).toHaveBeenCalledWith('snooze-uuid-1');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- --testPathPattern alarm-kit`
Expected: FAIL — `scheduleSnooze` is not exported

**Step 3: Implement snooze functions in `src/services/alarm-kit.ts`**

```typescript
export const SNOOZE_DURATION_SECONDS = 540; // 9 minutes

export async function scheduleSnooze(): Promise<string | null> {
  const kit = getAlarmKit();
  if (kit === null) return null;

  const id = kit.generateUUID();
  const now = new Date();
  const snoozeDate = new Date(now.getTime() + SNOOZE_DURATION_SECONDS * 1000);
  const epochSeconds = Math.floor(snoozeDate.getTime() / 1000);

  try {
    const success = await kit.scheduleAlarm({
      id,
      epochSeconds,
      title: 'Good Morning',
      launchAppOnDismiss: true,
      dismissPayload: JSON.stringify({ isSnooze: true }),
    });
    return success ? id : null;
  } catch {
    return null;
  }
}

export async function cancelSnooze(alarmId: string): Promise<void> {
  const kit = getAlarmKit();
  if (kit === null) return;
  await kit.cancelAlarm(alarmId);
}
```

**Step 4: Run tests**

Run: `pnpm test -- --testPathPattern alarm-kit`
Expected: All PASS

**Step 5: Commit**

```bash
jj commit -m "feat: add scheduleSnooze and cancelSnooze to alarm-kit service"
```

### Task 5: Add snooze state to morning-session-store

**Files:**
- Modify: `src/stores/morning-session-store.ts`
- Modify: `src/types/morning-session.ts`
- Test: `src/__tests__/morning-session-store.test.ts`

**Step 1: Write failing tests**

Add to `src/__tests__/morning-session-store.test.ts`:

```typescript
describe('snooze state', () => {
  it('stores snoozeAlarmId when set', async () => {
    await useMorningSessionStore.getState().startSession('wake_123', '2026-02-22', sampleTodos);
    useMorningSessionStore.getState().setSnoozeAlarmId('snooze-abc');

    expect(useMorningSessionStore.getState().snoozeAlarmId).toBe('snooze-abc');
  });

  it('clears snoozeAlarmId on clearSession', async () => {
    await useMorningSessionStore.getState().startSession('wake_123', '2026-02-22', sampleTodos);
    useMorningSessionStore.getState().setSnoozeAlarmId('snooze-abc');
    await useMorningSessionStore.getState().clearSession();

    expect(useMorningSessionStore.getState().snoozeAlarmId).toBeNull();
  });

  it('stores snoozeFiresAt timestamp', async () => {
    await useMorningSessionStore.getState().startSession('wake_123', '2026-02-22', sampleTodos);
    const fireTime = '2026-02-22T07:09:00.000Z';
    useMorningSessionStore.getState().setSnoozeFiresAt(fireTime);

    expect(useMorningSessionStore.getState().snoozeFiresAt).toBe(fireTime);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- --testPathPattern morning-session`
Expected: FAIL

**Step 3: Add snooze fields to store and type**

In `src/types/morning-session.ts`, add to `MorningSession`:
```typescript
export interface MorningSession {
  readonly recordId: string;
  readonly date: string;
  readonly startedAt: string;
  readonly todos: readonly SessionTodo[];
  readonly snoozeAlarmId: string | null;
  readonly snoozeFiresAt: string | null;
}
```

In `src/stores/morning-session-store.ts`, add:
- State fields: `snoozeAlarmId: string | null`, `snoozeFiresAt: string | null`
- Methods: `setSnoozeAlarmId(id: string | null)`, `setSnoozeFiresAt(time: string | null)`
- Update `startSession` to initialize `snoozeAlarmId: null, snoozeFiresAt: null`
- Update `clearSession` to also clear `snoozeAlarmId` and `snoozeFiresAt`

**Step 4: Run tests**

Run: `pnpm test -- --testPathPattern morning-session`
Expected: All PASS

**Step 5: Run full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: All PASS

**Step 6: Commit**

```bash
jj commit -m "feat: add snooze state to morning-session-store"
```

### Task 6: Wire snooze into wakeup dismiss flow

**Files:**
- Modify: `app/wakeup.tsx`

**Step 1: Import snooze functions**

```typescript
import { cancelAllAlarms, scheduleSnooze, SNOOZE_DURATION_SECONDS } from '../src/services/alarm-kit';
import { useMorningSessionStore } from '../src/stores/morning-session-store';
```

**Step 2: Modify `handleDismiss` to schedule snooze when TODOs exist**

After `startSession(record.id, dateStr, sessionTodos)`, add:

```typescript
// Schedule snooze (fires in 9 min if TODOs not completed)
const snoozeId = await scheduleSnooze();
if (snoozeId !== null) {
  const snoozeFiresAt = new Date(Date.now() + SNOOZE_DURATION_SECONDS * 1000).toISOString();
  useMorningSessionStore.getState().setSnoozeAlarmId(snoozeId);
  useMorningSessionStore.getState().setSnoozeFiresAt(snoozeFiresAt);
}
```

**Step 3: Handle snooze re-fire (payload detection)**

In `wakeup.tsx`, check `checkLaunchPayload()` for snooze flag. When snooze:
- Do NOT create new WakeRecord or MorningSession
- Re-schedule snooze if TODOs still remain
- Only stop sound/vibration and navigate back

Add to the component:

```typescript
const isSnooze = (() => {
  const payload = checkLaunchPayload();
  if (payload?.payload) {
    try {
      const parsed = JSON.parse(payload.payload);
      return parsed.isSnooze === true;
    } catch { return false; }
  }
  return false;
})();
```

Modify `handleDismiss`:
```typescript
if (isSnooze) {
  stopAlarmSound();
  Vibration.cancel();

  // Check if session still active with remaining TODOs
  const session = useMorningSessionStore.getState().session;
  if (session !== null && !useMorningSessionStore.getState().areAllCompleted()) {
    const snoozeId = await scheduleSnooze();
    if (snoozeId !== null) {
      const snoozeFiresAt = new Date(Date.now() + SNOOZE_DURATION_SECONDS * 1000).toISOString();
      useMorningSessionStore.getState().setSnoozeAlarmId(snoozeId);
      useMorningSessionStore.getState().setSnoozeFiresAt(snoozeFiresAt);
    }
  }
  router.replace('/');
  return;
}
```

**Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 5: Commit**

```bash
jj commit -m "feat: wire snooze scheduling into wakeup dismiss flow"
```

### Task 7: Cancel snooze on TODO completion

**Files:**
- Modify: `app/(tabs)/index.tsx`

**Step 1: Update session completion effect**

In the existing `useEffect` that watches for `areAllCompleted()` (lines 91-113), add snooze cancellation:

```typescript
useEffect(() => {
  if (session === null || !areAllCompleted()) return;

  const now = new Date();
  const todosCompletedAt = now.toISOString();
  const todoCompletionSeconds = Math.round(
    (now.getTime() - new Date(session.startedAt).getTime()) / 1000,
  );

  const todoRecords: readonly WakeTodoRecord[] = session.todos.map((todo, index) => ({
    id: todo.id,
    title: todo.title,
    completedAt: todo.completedAt,
    orderCompleted: todo.completed ? index + 1 : null,
  }));

  // Cancel pending snooze alarm
  const snoozeId = useMorningSessionStore.getState().snoozeAlarmId;
  if (snoozeId !== null) {
    cancelSnooze(snoozeId);
  }

  updateRecord(session.recordId, {
    todosCompleted: true,
    todosCompletedAt,
    todoCompletionSeconds,
    todos: todoRecords,
  }).then(() => clearSession());
}, [session, areAllCompleted, updateRecord, clearSession]);
```

Add import:
```typescript
import { cancelSnooze } from '../../src/services/alarm-kit';
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 3: Commit**

```bash
jj commit -m "feat: cancel snooze alarm when all TODOs completed"
```

### Task 8: Add snooze-related i18n keys

**Files:**
- Modify: `src/i18n/locales/ja/dashboard.json`
- Modify: `src/i18n/locales/en/dashboard.json`
- Modify: `src/i18n/locales/ja/wakeup.json`
- Modify: `src/i18n/locales/en/wakeup.json`

**Step 1: Add i18n keys**

In `ja/dashboard.json`, add to `morningRoutine`:
```json
"snoozeCountdown": "次のスヌーズまで {{time}}",
"allDone": "全タスク完了!"
```

In `en/dashboard.json`, add to `morningRoutine`:
```json
"snoozeCountdown": "Next snooze in {{time}}",
"allDone": "All tasks done!"
```

In `ja/wakeup.json`, add:
```json
"snoozeTitle": "スヌーズ",
"snoozeRemaining": "残りタスク: {{count}}件"
```

In `en/wakeup.json`, add:
```json
"snoozeTitle": "Snooze",
"snoozeRemaining": "Remaining tasks: {{count}}"
```

**Step 2: Run lint**

Run: `pnpm lint`
Expected: No errors

**Step 3: Commit**

```bash
jj commit -m "feat: add snooze-related i18n keys"
```

### Task 9: Show snooze countdown on dashboard

**Files:**
- Modify: `app/(tabs)/index.tsx`

**Step 1: Add countdown display in Morning Routine section**

Read `snoozeFiresAt` from the session store and display a countdown timer:

```typescript
const snoozeFiresAt = useMorningSessionStore((s) => s.snoozeFiresAt);
```

Add a countdown hook or inline calculation:
```typescript
const [snoozeRemaining, setSnoozeRemaining] = useState<string | null>(null);

useEffect(() => {
  if (snoozeFiresAt === null) {
    setSnoozeRemaining(null);
    return;
  }
  const updateCountdown = () => {
    const diff = new Date(snoozeFiresAt).getTime() - Date.now();
    if (diff <= 0) {
      setSnoozeRemaining(null);
      return;
    }
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    setSnoozeRemaining(`${mins}:${secs.toString().padStart(2, '0')}`);
  };
  updateCountdown();
  const timer = setInterval(updateCountdown, 1000);
  return () => clearInterval(timer);
}, [snoozeFiresAt]);
```

Add countdown display in the Morning Routine section (after progress bar):
```tsx
{snoozeRemaining !== null && (
  <Text style={styles.snoozeCountdownText}>
    {t('morningRoutine.snoozeCountdown', { time: snoozeRemaining })}
  </Text>
)}
```

Add style:
```typescript
snoozeCountdownText: {
  fontSize: fontSize.sm,
  color: colors.warning,
  textAlign: 'center',
  marginTop: spacing.xs,
},
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 3: Commit**

```bash
jj commit -m "feat: show snooze countdown timer on dashboard morning routine"
```

---

## Phase 3: Live Activity (Native Swift)

### Task 10: Create Widget Extension target and ActivityAttributes

**Files:**
- Create: `ios/GoodMorningWidgetExtension/MorningRoutineAttributes.swift`
- Create: `ios/GoodMorningWidgetExtension/Info.plist`
- Modify: `app.config.ts` — add Widget Extension target if Expo config plugin supports it

**Step 1: Create the Swift ActivityAttributes definition**

Create `ios/GoodMorningWidgetExtension/MorningRoutineAttributes.swift`:

```swift
import ActivityKit
import Foundation

struct TodoState: Codable, Hashable {
    var id: String
    var title: String
    var completed: Bool
}

struct MorningRoutineAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var todos: [TodoState]
        var snoozeFiresAt: Date?
    }
}
```

**Step 2: Create Info.plist**

Create `ios/GoodMorningWidgetExtension/Info.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSExtension</key>
    <dict>
        <key>NSExtensionPointIdentifier</key>
        <string>com.apple.widgetkit-extension</string>
    </dict>
</dict>
</plist>
```

**Step 3: Commit**

```bash
jj commit -m "feat: add Widget Extension skeleton with MorningRoutineAttributes"
```

> **Note:** The exact Xcode project integration (adding the Widget Extension target) will need to be done via `expo prebuild` or manual Xcode configuration. This depends on the Expo config plugin setup. Document this as a manual step if needed.

### Task 11: Create Live Activity view (SwiftUI)

**Files:**
- Create: `ios/GoodMorningWidgetExtension/MorningRoutineLiveActivity.swift`

**Step 1: Create the Live Activity view**

```swift
import ActivityKit
import SwiftUI
import WidgetKit

@available(iOS 16.2, *)
struct MorningRoutineLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: MorningRoutineAttributes.self) { context in
            // Lock screen expanded view
            MorningRoutineLockScreenView(context: context)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded view
                DynamicIslandExpandedRegion(.leading) {
                    Label {
                        Text(progressText(context.state))
                    } icon: {
                        Image(systemName: "sun.max.fill")
                            .foregroundColor(.yellow)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if let snoozeTime = context.state.snoozeFiresAt {
                        Text(snoozeTime, style: .timer)
                            .monospacedDigit()
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 4) {
                        ProgressView(value: progress(context.state))
                            .tint(.green)
                        ForEach(context.state.todos, id: \.id) { todo in
                            HStack {
                                Image(systemName: todo.completed ? "checkmark.circle.fill" : "circle")
                                    .foregroundColor(todo.completed ? .green : .gray)
                                Text(todo.title)
                                    .strikethrough(todo.completed)
                                    .foregroundColor(todo.completed ? .gray : .primary)
                                Spacer()
                            }
                            .font(.caption)
                        }
                    }
                }
            } compactLeading: {
                HStack(spacing: 4) {
                    Image(systemName: "sun.max.fill")
                        .foregroundColor(.yellow)
                    Text(progressText(context.state))
                        .font(.caption2)
                }
            } compactTrailing: {
                if let snoozeTime = context.state.snoozeFiresAt {
                    Text(snoozeTime, style: .timer)
                        .monospacedDigit()
                        .font(.caption2)
                }
            } minimal: {
                Image(systemName: "sun.max.fill")
                    .foregroundColor(.yellow)
            }
        }
    }

    private func progress(_ state: MorningRoutineAttributes.ContentState) -> Double {
        let total = state.todos.count
        guard total > 0 else { return 1.0 }
        let completed = state.todos.filter(\.completed).count
        return Double(completed) / Double(total)
    }

    private func progressText(_ state: MorningRoutineAttributes.ContentState) -> String {
        let completed = state.todos.filter(\.completed).count
        return "\(completed)/\(state.todos.count)"
    }
}

@available(iOS 16.2, *)
struct MorningRoutineLockScreenView: View {
    let context: ActivityViewContext<MorningRoutineAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "sun.max.fill")
                    .foregroundColor(.yellow)
                Text("Good Morning")
                    .font(.headline)
                Spacer()
                if let snoozeTime = context.state.snoozeFiresAt {
                    Text(snoozeTime, style: .timer)
                        .monospacedDigit()
                        .font(.caption)
                        .foregroundColor(.orange)
                }
            }

            ForEach(context.state.todos, id: \.id) { todo in
                HStack {
                    Image(systemName: todo.completed ? "checkmark.circle.fill" : "circle")
                        .foregroundColor(todo.completed ? .green : .gray)
                    Text(todo.title)
                        .strikethrough(todo.completed)
                        .foregroundColor(todo.completed ? .secondary : .primary)
                }
                .font(.subheadline)
            }

            let completed = context.state.todos.filter(\.completed).count
            let total = context.state.todos.count
            ProgressView(value: Double(completed), total: Double(max(total, 1)))
                .tint(.green)
            Text("\(completed) / \(total)")
                .font(.caption)
                .foregroundColor(.secondary)
                .frame(maxWidth: .infinity, alignment: .center)
        }
        .padding()
    }
}
```

**Step 2: Commit**

```bash
jj commit -m "feat: add Live Activity SwiftUI views for morning routine"
```

### Task 12: Add Live Activity functions to expo-alarm-kit native module

**This task requires modifying the `expo-alarm-kit` npm package.** Since it's an external package (v0.1.6), there are two approaches:

**Option A (Recommended):** Fork or patch `expo-alarm-kit` to add Live Activity functions.
**Option B:** Create a separate local Expo module for Live Activity only.

> **Decision point for implementer:** Check if `expo-alarm-kit` is owned by the project maintainer. If yes, modify directly. If third-party, use `pnpm patch expo-alarm-kit` to create a local patch.

**Step 1: Add Live Activity functions to the native Swift module**

Add to `ExpoAlarmKitModule.swift` (inside `definition()`):

```swift
// MARK: - Live Activity: Start
AsyncFunction("startLiveActivity") { (todosRaw: [[String: Any]], snoozeFiresAtEpoch: Double?) async throws -> String? in
    guard ActivityAuthorizationInfo().areActivitiesEnabled else {
        print("[ExpoAlarmKit] Live Activities not enabled")
        return nil
    }

    let todos = todosRaw.map { dict -> TodoState in
        TodoState(
            id: dict["id"] as? String ?? "",
            title: dict["title"] as? String ?? "",
            completed: dict["completed"] as? Bool ?? false
        )
    }

    let snoozeDate: Date? = snoozeFiresAtEpoch.map { Date(timeIntervalSince1970: $0) }

    let state = MorningRoutineAttributes.ContentState(
        todos: todos,
        snoozeFiresAt: snoozeDate
    )
    let attributes = MorningRoutineAttributes()

    do {
        let activity = try Activity.request(
            attributes: attributes,
            content: .init(state: state, staleDate: nil),
            pushType: nil
        )
        return activity.id
    } catch {
        print("[ExpoAlarmKit] Failed to start Live Activity: \(error)")
        return nil
    }
}

// MARK: - Live Activity: Update
AsyncFunction("updateLiveActivity") { (activityId: String, todosRaw: [[String: Any]], snoozeFiresAtEpoch: Double?) async throws -> Bool in
    let todos = todosRaw.map { dict -> TodoState in
        TodoState(
            id: dict["id"] as? String ?? "",
            title: dict["title"] as? String ?? "",
            completed: dict["completed"] as? Bool ?? false
        )
    }

    let snoozeDate: Date? = snoozeFiresAtEpoch.map { Date(timeIntervalSince1970: $0) }

    let state = MorningRoutineAttributes.ContentState(
        todos: todos,
        snoozeFiresAt: snoozeDate
    )

    for activity in Activity<MorningRoutineAttributes>.activities {
        if activity.id == activityId {
            await activity.update(.init(state: state, staleDate: nil))
            return true
        }
    }
    return false
}

// MARK: - Live Activity: End
AsyncFunction("endLiveActivity") { (activityId: String) async throws -> Bool in
    for activity in Activity<MorningRoutineAttributes>.activities {
        if activity.id == activityId {
            await activity.end(nil, dismissalPolicy: .immediate)
            return true
        }
    }
    return false
}
```

**Step 2: Add corresponding TypeScript exports**

Add to `src/services/alarm-kit.ts`:

```typescript
export interface LiveActivityTodo {
  id: string;
  title: string;
  completed: boolean;
}

export async function startLiveActivity(
  todos: readonly LiveActivityTodo[],
  snoozeFiresAt: string | null,
): Promise<string | null> {
  const kit = getAlarmKit();
  if (kit === null) return null;

  try {
    const snoozeEpoch = snoozeFiresAt !== null
      ? Math.floor(new Date(snoozeFiresAt).getTime() / 1000)
      : null;
    return await (kit as any).startLiveActivity(
      todos.map(t => ({ id: t.id, title: t.title, completed: t.completed })),
      snoozeEpoch,
    );
  } catch {
    return null;
  }
}

export async function updateLiveActivity(
  activityId: string,
  todos: readonly LiveActivityTodo[],
  snoozeFiresAt: string | null,
): Promise<void> {
  const kit = getAlarmKit();
  if (kit === null) return;

  try {
    const snoozeEpoch = snoozeFiresAt !== null
      ? Math.floor(new Date(snoozeFiresAt).getTime() / 1000)
      : null;
    await (kit as any).updateLiveActivity(
      activityId,
      todos.map(t => ({ id: t.id, title: t.title, completed: t.completed })),
      snoozeEpoch,
    );
  } catch {
    // Non-blocking
  }
}

export async function endLiveActivity(activityId: string): Promise<void> {
  const kit = getAlarmKit();
  if (kit === null) return;

  try {
    await (kit as any).endLiveActivity(activityId);
  } catch {
    // Non-blocking
  }
}
```

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 4: Commit**

```bash
jj commit -m "feat: add Live Activity start/update/end to alarm-kit service"
```

### Task 13: Add liveActivityId to morning-session-store

**Files:**
- Modify: `src/stores/morning-session-store.ts`
- Modify: `src/types/morning-session.ts`
- Test: `src/__tests__/morning-session-store.test.ts`

**Step 1: Write failing test**

```typescript
describe('live activity state', () => {
  it('stores liveActivityId when set', async () => {
    await useMorningSessionStore.getState().startSession('wake_123', '2026-02-22', sampleTodos);
    useMorningSessionStore.getState().setLiveActivityId('activity-xyz');
    expect(useMorningSessionStore.getState().liveActivityId).toBe('activity-xyz');
  });

  it('clears liveActivityId on clearSession', async () => {
    await useMorningSessionStore.getState().startSession('wake_123', '2026-02-22', sampleTodos);
    useMorningSessionStore.getState().setLiveActivityId('activity-xyz');
    await useMorningSessionStore.getState().clearSession();
    expect(useMorningSessionStore.getState().liveActivityId).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --testPathPattern morning-session`
Expected: FAIL

**Step 3: Add `liveActivityId` to type and store**

In `MorningSession` type, add: `readonly liveActivityId: string | null;`

In store:
- State: `liveActivityId: string | null` (initial: `null`)
- Method: `setLiveActivityId(id: string | null)`
- Update `startSession`: initialize `liveActivityId: null`
- Update `clearSession`: set `liveActivityId: null`

**Step 4: Run tests**

Run: `pnpm test`
Expected: All PASS

**Step 5: Commit**

```bash
jj commit -m "feat: add liveActivityId to morning-session-store"
```

### Task 14: Wire Live Activity into wakeup + dashboard flows

**Files:**
- Modify: `app/wakeup.tsx`
- Modify: `app/(tabs)/index.tsx`

**Step 1: Start Live Activity on dismiss (wakeup.tsx)**

After starting session and scheduling snooze, add:

```typescript
import { startLiveActivity } from '../src/services/alarm-kit';

// After startSession and scheduleSnooze:
const liveActivityTodos = todos.map(t => ({
  id: t.id,
  title: t.title,
  completed: false,
}));
const activityId = await startLiveActivity(liveActivityTodos, snoozeFiresAt);
if (activityId !== null) {
  useMorningSessionStore.getState().setLiveActivityId(activityId);
}
```

**Step 2: Update Live Activity on TODO toggle (dashboard index.tsx)**

After each `toggleTodo`, update the Live Activity:

```typescript
import { updateLiveActivity, endLiveActivity, cancelSnooze } from '../../src/services/alarm-kit';

const handleToggleTodo = useCallback(
  (todoId: string) => {
    toggleTodo(todoId);

    // Update Live Activity after state change
    const state = useMorningSessionStore.getState();
    const activityId = state.liveActivityId;
    if (activityId !== null && state.session !== null) {
      updateLiveActivity(
        activityId,
        state.session.todos.map(t => ({
          id: t.id,
          title: t.title,
          completed: t.id === todoId ? !t.completed : t.completed,
        })),
        state.snoozeFiresAt,
      );
    }
  },
  [toggleTodo],
);
```

**Step 3: End Live Activity on completion**

In the session completion `useEffect`, add before `clearSession()`:

```typescript
const activityId = useMorningSessionStore.getState().liveActivityId;
if (activityId !== null) {
  endLiveActivity(activityId);
}
```

**Step 4: Update Live Activity on snooze re-fire (wakeup.tsx)**

In the snooze dismiss handler, after rescheduling snooze, update countdown:

```typescript
const activityId = useMorningSessionStore.getState().liveActivityId;
if (activityId !== null && session !== null) {
  updateLiveActivity(
    activityId,
    session.todos.map(t => ({ id: t.id, title: t.title, completed: t.completed })),
    snoozeFiresAt,
  );
}
```

**Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 6: Commit**

```bash
jj commit -m "feat: wire Live Activity into wakeup dismiss and dashboard TODO toggle"
```

---

## Phase 4: Verification & Polish

### Task 15: Update alarm-kit mock for tests

**Files:**
- Modify: Jest mock for `expo-alarm-kit` (check `__mocks__` or jest setup)

**Step 1: Find and update the mock**

Search for existing `expo-alarm-kit` mock:
```bash
grep -r "expo-alarm-kit" src/__mocks__/ jest.setup.* jest.config.*
```

Add mock functions for the new exports: `startLiveActivity`, `updateLiveActivity`, `endLiveActivity`.

**Step 2: Run full test suite**

Run: `pnpm test`
Expected: All PASS

**Step 3: Commit**

```bash
jj commit -m "test: update expo-alarm-kit mock with Live Activity functions"
```

### Task 16: Run full verification

**Step 1: Lint**

Run: `pnpm lint`
Expected: No errors

**Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 3: Tests**

Run: `pnpm test`
Expected: All PASS

**Step 4: Verify no notification references remain**

Run: `grep -r "expo-notifications" src/ app/ --include="*.ts" --include="*.tsx"`
Expected: No matches (only in node_modules, which is OK)

**Step 5: Final commit if any cleanup needed**

```bash
jj commit -m "chore: final cleanup for snooze + live activity feature"
```
