# Snooze + Live Activity + Legacy Notification Cleanup

Date: 2026-02-25

## Overview

AlarmKit を拡張して、(1) TODO 完了まで繰り返すスヌーズ、(2) Live Activity によるロック画面進捗表示、(3) レガシー通知コードの削除を行う。

## Flow

```
ALARM FIRES (AlarmKit)
  → /wakeup (full-screen, sound + vibration)
  → User taps "Dismiss"
  → WakeRecord created
  → MorningSession started
  → Live Activity started (progress 0/N + 9:00 countdown)
  → Snooze scheduled (AlarmKit, 9 min)
  → Navigate to dashboard → TODO check-off

  IF all TODOs completed within 9 min:
    → Cancel snooze alarm
    → End Live Activity
    → Update WakeRecord with completion data
    → Clear session

  IF 9 min elapsed, TODOs incomplete:
    → Snooze fires → /wakeup (full-screen, sound + vibration)
    → User taps "Dismiss"
    → Schedule new snooze (9 min)
    → Update Live Activity (reset countdown)
    → Continue session (no new session/record)
    → Repeat until all TODOs done
```

## AlarmKit API Additions

### Snooze

```typescript
scheduleSnooze(delaySeconds: number): Promise<string | null>
cancelSnooze(alarmId: string): Promise<void>
```

- `scheduleSnooze` schedules a one-time AlarmKit alarm N seconds from now
- Returns alarm ID for cancellation
- Snooze alarm includes `isSnooze: true` in launch payload

### Live Activity

```typescript
startLiveActivity(params: {
  todos: { id: string; title: string; completed: boolean }[]
  snoozeFiresAt: string  // ISO datetime
}): Promise<string | null>

updateLiveActivity(activityId: string, params: {
  todos: { id: string; title: string; completed: boolean }[]
  snoozeFiresAt: string | null
}): Promise<void>

endLiveActivity(activityId: string): Promise<void>
```

## Live Activity UI

### Lock Screen (Expanded)

- App icon + "Good Morning"
- TODO list with checkmarks (completed) / circles (pending)
- Progress bar with "X/Y" label
- Countdown timer to next snooze (iOS `Text.Timer`)

### Dynamic Island (Compact)

- Leading: app icon + "X/Y"
- Trailing: countdown timer

### Dynamic Island (Minimal)

- Leading: app icon
- Trailing: countdown timer

## Widget Extension (Swift)

```
ios/
  GoodMorningWidgetExtension/
    LiveActivityAttributes.swift
    LiveActivityView.swift
    Info.plist
```

### ActivityAttributes

```swift
struct MorningRoutineAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var todos: [TodoState]
        var snoozeFiresAt: Date?
    }
    struct TodoState: Codable, Hashable {
        var id: String
        var title: String
        var completed: Bool
    }
}
```

Uses existing App Group: `group.com.tktcorporation.goodmorning`

## State Management Changes

### morning-session-store.ts

Add fields:

```typescript
snoozeAlarmId: string | null
liveActivityId: string | null
```

Add methods:

```typescript
startSnoozeLoop(): Promise<void>
cancelSnoozeIfCompleted(): Promise<void>
```

### toggleTodo enhancement

```
toggleTodo(todoId)
  → Update session (existing)
  → updateLiveActivity() with new progress
  → If all completed:
    → cancelSnooze()
    → endLiveActivity()
    → Update WakeRecord
    → Clear session
```

### Snooze re-fire handling (_layout.tsx)

```
checkLaunchPayload()
  → If payload.isSnooze === true:
    → Navigate to /wakeup
    → On dismiss:
      → Schedule new snooze (if TODOs remain)
      → Reset Live Activity countdown
      → Do NOT create new session/record
```

## Legacy Notification Cleanup

### Delete

| File | What |
|------|------|
| `src/services/notifications.ts` | Entire file |

### Remove references

| File | Lines | What |
|------|-------|------|
| `app/_layout.tsx` | 15-18, 46, 112-118 | Notification imports, permission request, listeners |
| `src/types/alarm.ts` | 37 | `Alarm.notificationIds` field |
| `src/stores/wake-target-store.ts` | 11, 48 | `LEGACY_NOTIFICATION_IDS_KEY` + migration code |

### Replacement

Alarm trigger detection fully handled by `checkLaunchPayload()` (already implemented).

## Snooze Interval

Fixed 9 minutes (540 seconds), matching iOS default behavior.
