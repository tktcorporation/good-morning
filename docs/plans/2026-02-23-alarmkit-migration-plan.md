# AlarmKit Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** expo-alarm-kit を使って AlarmKit に移行し、サイレントモードでもアラーム音が鳴るようにする

**Architecture:** 現在の expo-notifications ベースのアラームスケジューリングを expo-alarm-kit (AlarmKit) に置き換える。expo-av はデモ試聴のみに限定し、expo-notifications はフォアグラウンド補助のみに使用する。

**Tech Stack:** expo-alarm-kit, Expo SDK 54, TypeScript, Zustand, Jest

---

### Task 1: Install expo-alarm-kit

**Files:**
- Modify: `package.json`

**Step 1: Install the package**

Run: `pnpm add expo-alarm-kit`
Expected: Package added to dependencies

**Step 2: Verify installation**

Run: `pnpm typecheck`
Expected: No new type errors

**Step 3: Commit**

Run: `jj commit -m "chore: add expo-alarm-kit dependency"`

---

### Task 2: Update app.config.ts for AlarmKit requirements

**Files:**
- Modify: `app.config.ts`

**Step 1: Add AlarmKit plist keys and App Group**

In `app.config.ts`, add to `ios.infoPlist`:

```typescript
ios: {
  supportsTablet: false,
  bundleIdentifier: 'com.tktcorporation.goodmorning',
  infoPlist: {
    UIBackgroundModes: ['audio'],
    ITSAppUsesNonExemptEncryption: false,
    NSAlarmKitUsageDescription: 'Good Morning uses alarms to wake you up at your scheduled time.',
    NSSupportsLiveActivities: true,
  },
  entitlements: {
    'com.apple.developer.healthkit': true,
    'com.apple.security.application-groups': ['group.com.tktcorporation.goodmorning'],
  },
},
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

Run: `jj commit -m "feat: add AlarmKit plist keys and App Group entitlement"`

---

### Task 3: Create AlarmKit service — test first

**Files:**
- Create: `src/services/alarm-kit.ts`
- Create: `src/__tests__/alarm-kit.test.ts`

**Step 1: Write the test file**

```typescript
// src/__tests__/alarm-kit.test.ts

// Mock expo-alarm-kit before imports
const mockConfigure = jest.fn().mockReturnValue(true);
const mockRequestAuthorization = jest.fn().mockResolvedValue('authorized');
const mockScheduleRepeatingAlarm = jest.fn().mockResolvedValue(true);
const mockScheduleAlarm = jest.fn().mockResolvedValue(true);
const mockCancelAlarm = jest.fn().mockResolvedValue(true);
const mockGetAllAlarms = jest.fn().mockReturnValue([]);
const mockGenerateUUID = jest.fn().mockReturnValue('test-uuid-1');
const mockGetLaunchPayload = jest.fn().mockReturnValue(null);

jest.mock('expo-alarm-kit', () => ({
  configure: mockConfigure,
  requestAuthorization: mockRequestAuthorization,
  scheduleRepeatingAlarm: mockScheduleRepeatingAlarm,
  scheduleAlarm: mockScheduleAlarm,
  cancelAlarm: mockCancelAlarm,
  getAllAlarms: mockGetAllAlarms,
  generateUUID: mockGenerateUUID,
  getLaunchPayload: mockGetLaunchPayload,
}));

import type { DayOfWeek } from '../types/alarm';
import type { WakeTarget } from '../types/wake-target';
import { DEFAULT_WAKE_TARGET } from '../types/wake-target';
import {
  APP_GROUP_ID,
  cancelAllAlarms,
  checkLaunchPayload,
  initializeAlarmKit,
  scheduleWakeTargetAlarm,
} from '../services/alarm-kit';

describe('alarm-kit service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initializeAlarmKit', () => {
    test('calls configure with app group and requests authorization', async () => {
      const result = await initializeAlarmKit();
      expect(mockConfigure).toHaveBeenCalledWith(APP_GROUP_ID);
      expect(mockRequestAuthorization).toHaveBeenCalled();
      expect(result).toBe('authorized');
    });

    test('returns denied when configure fails', async () => {
      mockConfigure.mockReturnValueOnce(false);
      const result = await initializeAlarmKit();
      expect(result).toBe('denied');
      expect(mockRequestAuthorization).not.toHaveBeenCalled();
    });
  });

  describe('scheduleWakeTargetAlarm', () => {
    test('cancels existing alarms and schedules repeating alarm for enabled days', async () => {
      mockGetAllAlarms.mockReturnValue(['old-alarm-1']);
      // Generate unique UUIDs for each call
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);

      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        defaultTime: { hour: 7, minute: 30 },
        enabled: true,
      };

      const ids = await scheduleWakeTargetAlarm(target);

      // Should cancel the old alarm
      expect(mockCancelAlarm).toHaveBeenCalledWith('old-alarm-1');
      // Should schedule one repeating alarm with all 7 weekdays
      expect(mockScheduleRepeatingAlarm).toHaveBeenCalledTimes(1);
      expect(mockScheduleRepeatingAlarm).toHaveBeenCalledWith(
        expect.objectContaining({
          hour: 7,
          minute: 30,
          weekdays: [1, 2, 3, 4, 5, 6, 7],
          launchAppOnDismiss: true,
        }),
      );
      expect(ids.length).toBe(1);
    });

    test('skips days that are set to off', async () => {
      mockGetAllAlarms.mockReturnValue([]);
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);

      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        defaultTime: { hour: 7, minute: 0 },
        dayOverrides: {
          0: { type: 'off' },  // Sunday off
          6: { type: 'off' },  // Saturday off
        },
        enabled: true,
      };

      await scheduleWakeTargetAlarm(target);

      expect(mockScheduleRepeatingAlarm).toHaveBeenCalledTimes(1);
      // Weekdays only: Mon=2, Tue=3, Wed=4, Thu=5, Fri=6
      expect(mockScheduleRepeatingAlarm).toHaveBeenCalledWith(
        expect.objectContaining({
          weekdays: [2, 3, 4, 5, 6],
        }),
      );
    });

    test('groups days by time and schedules separate alarms for different times', async () => {
      mockGetAllAlarms.mockReturnValue([]);
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);

      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        defaultTime: { hour: 7, minute: 0 },
        dayOverrides: {
          6: { type: 'custom', time: { hour: 8, minute: 30 } },  // Saturday custom
        },
        enabled: true,
      };

      await scheduleWakeTargetAlarm(target);

      // Two separate repeating alarms: default time + Saturday custom time
      expect(mockScheduleRepeatingAlarm).toHaveBeenCalledTimes(2);
    });

    test('schedules one-time alarm for nextOverride', async () => {
      mockGetAllAlarms.mockReturnValue([]);
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);

      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        nextOverride: { time: { hour: 6, minute: 0 } },
        enabled: true,
      };

      await scheduleWakeTargetAlarm(target);

      // Should schedule one-time alarm for nextOverride
      expect(mockScheduleAlarm).toHaveBeenCalledTimes(1);
      expect(mockScheduleAlarm).toHaveBeenCalledWith(
        expect.objectContaining({
          launchAppOnDismiss: true,
        }),
      );
    });

    test('returns empty array when target is disabled', async () => {
      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        enabled: false,
      };

      const ids = await scheduleWakeTargetAlarm(target);
      expect(ids).toEqual([]);
      expect(mockScheduleRepeatingAlarm).not.toHaveBeenCalled();
    });
  });

  describe('cancelAllAlarms', () => {
    test('cancels all active alarms', async () => {
      mockGetAllAlarms.mockReturnValue(['alarm-1', 'alarm-2']);
      await cancelAllAlarms();
      expect(mockCancelAlarm).toHaveBeenCalledWith('alarm-1');
      expect(mockCancelAlarm).toHaveBeenCalledWith('alarm-2');
    });
  });

  describe('checkLaunchPayload', () => {
    test('returns null when no payload', () => {
      mockGetLaunchPayload.mockReturnValue(null);
      expect(checkLaunchPayload()).toBeNull();
    });

    test('returns payload when launched from alarm', () => {
      mockGetLaunchPayload.mockReturnValue({ alarmId: 'abc', payload: null });
      expect(checkLaunchPayload()).toEqual({ alarmId: 'abc', payload: null });
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- src/__tests__/alarm-kit.test.ts`
Expected: FAIL — module `../services/alarm-kit` not found

**Step 3: Write the alarm-kit service**

```typescript
// src/services/alarm-kit.ts
import {
  cancelAlarm,
  configure,
  generateUUID,
  getAllAlarms,
  getLaunchPayload,
  requestAuthorization,
  scheduleAlarm,
  scheduleRepeatingAlarm,
} from 'expo-alarm-kit';
import type { LaunchPayload } from 'expo-alarm-kit';

import type { AlarmTime, DayOfWeek } from '../types/alarm';
import type { WakeTarget } from '../types/wake-target';

export const APP_GROUP_ID = 'group.com.tktcorporation.goodmorning';

// biome-ignore lint/suspicious/noConsole: AlarmKit errors need logging for debugging
const logError = console.error;

export async function initializeAlarmKit(): Promise<'authorized' | 'denied'> {
  const configured = configure(APP_GROUP_ID);
  if (!configured) {
    logError('[AlarmKit] Failed to configure App Group');
    return 'denied';
  }
  const status = await requestAuthorization();
  return status === 'authorized' ? 'authorized' : 'denied';
}

/**
 * Convert DayOfWeek (0=Sunday, 1=Monday, ..., 6=Saturday)
 * to iOS Calendar weekday (1=Sunday, 2=Monday, ..., 7=Saturday)
 */
function toIOSWeekday(day: DayOfWeek): number {
  return day + 1;
}

/**
 * Resolve the alarm time for a specific day, considering overrides.
 * Returns null if the day is set to OFF.
 */
function resolveTimeForDay(target: WakeTarget, day: DayOfWeek): AlarmTime | null {
  const override = target.dayOverrides[day];
  if (override !== undefined) {
    if (override.type === 'off') return null;
    return override.time;
  }
  return target.defaultTime;
}

/**
 * Group enabled days by their resolved time so we can schedule
 * one repeating alarm per unique time.
 */
function groupDaysByTime(
  target: WakeTarget,
): ReadonlyMap<string, { time: AlarmTime; weekdays: number[] }> {
  const groups = new Map<string, { time: AlarmTime; weekdays: number[] }>();
  for (let d = 0; d < 7; d++) {
    const day = d as DayOfWeek;
    const time = resolveTimeForDay(target, day);
    if (time === null) continue;
    const key = `${time.hour}:${time.minute}`;
    const existing = groups.get(key);
    if (existing !== undefined) {
      existing.weekdays.push(toIOSWeekday(day));
    } else {
      groups.set(key, { time, weekdays: [toIOSWeekday(day)] });
    }
  }
  return groups;
}

export async function scheduleWakeTargetAlarm(
  target: WakeTarget,
): Promise<readonly string[]> {
  // Cancel all existing alarms first
  await cancelAllAlarms();

  if (!target.enabled) return [];

  const ids: string[] = [];
  const alarmTitle = 'Good Morning';

  // Schedule repeating alarms grouped by time
  const groups = groupDaysByTime(target);
  for (const [, { time, weekdays }] of groups) {
    const id = generateUUID();
    const success = await scheduleRepeatingAlarm({
      id,
      hour: time.hour,
      minute: time.minute,
      weekdays,
      title: alarmTitle,
      soundName: target.soundId !== 'default' ? `${target.soundId}.mp3` : undefined,
      launchAppOnDismiss: true,
    });
    if (success) ids.push(id);
  }

  // Schedule one-time alarm for nextOverride
  if (target.nextOverride !== null) {
    const id = generateUUID();
    const now = new Date();
    const alarmDate = new Date(now);
    alarmDate.setHours(target.nextOverride.time.hour, target.nextOverride.time.minute, 0, 0);
    // If the time has already passed today, schedule for tomorrow
    if (alarmDate.getTime() <= now.getTime()) {
      alarmDate.setDate(alarmDate.getDate() + 1);
    }
    const epochSeconds = Math.floor(alarmDate.getTime() / 1000);

    const success = await scheduleAlarm({
      id,
      epochSeconds,
      title: alarmTitle,
      soundName: target.soundId !== 'default' ? `${target.soundId}.mp3` : undefined,
      launchAppOnDismiss: true,
    });
    if (success) ids.push(id);
  }

  return ids;
}

export async function cancelAllAlarms(): Promise<void> {
  const existing = getAllAlarms();
  const cancellations = existing.map((id) => cancelAlarm(id));
  await Promise.all(cancellations);
}

export function checkLaunchPayload(): LaunchPayload | null {
  return getLaunchPayload();
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/__tests__/alarm-kit.test.ts`
Expected: All tests PASS

**Step 5: Run lint**

Run: `pnpm lint`
Expected: No errors in alarm-kit files

**Step 6: Commit**

Run: `jj commit -m "feat: add AlarmKit service with tests"`

---

### Task 4: Update WakeTarget store — replace notification IDs with alarm IDs

**Files:**
- Modify: `src/stores/wake-target-store.ts`
- Modify: `src/__tests__/wake-target-store.test.ts`

**Step 1: Update the store**

In `src/stores/wake-target-store.ts`:

1. Rename `NOTIFICATION_IDS_KEY` to `ALARM_IDS_KEY` with value `'alarm-ids'`
2. Rename `notificationIds` field to `alarmIds`
3. Rename `setNotificationIds` to `setAlarmIds`
4. Update `loadTarget` to read from both old and new keys (migration)

The key changes:

```typescript
const ALARM_IDS_KEY = 'alarm-ids';
// Keep old key for migration
const LEGACY_NOTIFICATION_IDS_KEY = 'notification-ids';

interface WakeTargetState {
  // ... existing fields ...
  readonly alarmIds: readonly string[];
  // ... existing methods ...
  setAlarmIds: (ids: readonly string[]) => Promise<void>;
}
```

In `loadTarget`:
```typescript
loadTarget: async () => {
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
  // ... rest of loadTarget, using alarmIds ...
},
```

**Step 2: Update tests**

Update `src/__tests__/wake-target-store.test.ts` to use `alarmIds` instead of `notificationIds` and `setAlarmIds` instead of `setNotificationIds`.

**Step 3: Run tests**

Run: `pnpm test -- src/__tests__/wake-target-store.test.ts`
Expected: All tests PASS

**Step 4: Run typecheck to find all references that need updating**

Run: `pnpm typecheck`
Expected: Errors in `_layout.tsx` and `wakeup.tsx` referencing old names — these will be fixed in subsequent tasks

**Step 5: Commit**

Run: `jj commit -m "refactor: rename notificationIds to alarmIds in wake-target store"`

---

### Task 5: Update _layout.tsx — integrate AlarmKit initialization and scheduling

**Files:**
- Modify: `app/_layout.tsx`

**Step 1: Replace notification scheduling with AlarmKit scheduling**

Key changes in `app/_layout.tsx`:

1. Import `initializeAlarmKit`, `scheduleWakeTargetAlarm`, `cancelAllAlarms`, `checkLaunchPayload` from `alarm-kit` service
2. Replace `scheduleWakeTargetNotifications` with `scheduleWakeTargetAlarm`
3. Add `initializeAlarmKit()` call in the initialization `useEffect`
4. Add `checkLaunchPayload()` logic to detect alarm-launched app opens
5. Update references from `notificationIds` / `setNotificationIds` to `alarmIds` / `setAlarmIds`

```typescript
// New imports
import {
  cancelAllAlarms,
  checkLaunchPayload,
  initializeAlarmKit,
  scheduleWakeTargetAlarm,
} from '../src/services/alarm-kit';

// In the initialization useEffect:
useEffect(() => {
  loadTarget();
  loadRecords();
  loadSession();
  loadSettings();
  requestNotificationPermissions();
  initializeAlarmKit();

  // Check if launched from alarm dismiss
  const payload = checkLaunchPayload();
  if (payload !== null) {
    router.push('/wakeup');
  }

  AsyncStorage.getItem('onboarding-completed').then((val) => {
    setOnboardingDone(val === 'true');
  });
}, [loadTarget, loadRecords, loadSession, loadSettings]);

// In the target scheduling useEffect, replace:
// scheduleWakeTargetNotifications(target, notificationIds) → scheduleWakeTargetAlarm(target)
useEffect(() => {
  if (target === null) return;

  if (target.enabled) {
    scheduleWakeTargetAlarm(target).then((newIds) => {
      setAlarmIds(newIds);
    });
  } else {
    cancelAllAlarms().then(() => {
      setAlarmIds([]);
    });
  }
}, [target]);
```

Keep the notification listener for foreground alarm triggers (`addNotificationReceivedListener` / `addNotificationResponseListener`) as-is — they still serve as a backup when the app is in the foreground.

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (or remaining errors from wakeup.tsx — addressed next)

**Step 3: Commit**

Run: `jj commit -m "feat: integrate AlarmKit initialization and scheduling in root layout"`

---

### Task 6: Update wakeup.tsx — simplify alarm sound for AlarmKit

**Files:**
- Modify: `app/wakeup.tsx`

**Step 1: Simplify sound playing logic**

Since AlarmKit handles the system-level alarm sound, `wakeup.tsx` only needs expo-av for demo mode. Update the alarm sound effect:

```typescript
// In the alarm sound useEffect:
useEffect(() => {
  if (isDemo) {
    playAlarmSound(target?.soundId);
    const timer = setTimeout(() => {
      stopAlarmSound();
    }, DEMO_SOUND_DURATION_MS);
    return () => {
      clearTimeout(timer);
      stopAlarmSound();
    };
  }

  // In non-demo mode, AlarmKit already played the system alarm.
  // Just start vibration as haptic feedback supplement.
  Vibration.vibrate(VIBRATION_PATTERN, true);

  return () => {
    Vibration.cancel();
  };
}, [isDemo, target?.soundId]);
```

Also update references from `notificationIds` / `setNotificationIds` to `alarmIds` / `setAlarmIds`.

In `handleDismiss`, replace notification cancellation:
```typescript
// Replace cancelAlarmNotifications(notificationIds) with cancelAllAlarms()
if (alarmIds.length > 0) {
  cancelAllAlarms().then(() => {
    setAlarmIds([]);
  });
}
```

**Step 2: Remove unused imports**

Remove unused imports: `isPlaying`, `playAlarmSound`, `stopAlarmSound` from sound.ts (only keep for demo), and `cancelAlarmNotifications` from notifications.ts.

**Step 3: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 4: Commit**

Run: `jj commit -m "feat: simplify wakeup screen for AlarmKit — demo-only sound playback"`

---

### Task 7: Clean up notifications.ts — remove alarm scheduling code

**Files:**
- Modify: `src/services/notifications.ts`
- Modify: `src/__tests__/notifications.test.ts`

**Step 1: Remove `scheduleWakeTargetNotifications` and related helpers**

Remove:
- `REPEAT_COUNT` and `REPEAT_INTERVAL_SECONDS` constants
- `buildCalendarTrigger` function
- `dayOfWeekToCalendarWeekday` function
- `scheduleWakeTargetNotifications` function
- Unused imports (`getAlarmSound`, `AlarmTime`, `DayOfWeek`, `WakeTarget`, `resolveTimeForDate`)

Keep:
- `Notifications.setNotificationHandler` (still needed for foreground notifications)
- `requestNotificationPermissions` (still used in `_layout.tsx`)
- `cancelAlarmNotifications` (may still be useful for legacy cleanup)
- `addNotificationResponseListener`
- `addNotificationReceivedListener`

**Step 2: Update notification tests**

Remove tests for `scheduleWakeTargetNotifications` that no longer apply. Keep tests for `requestNotificationPermissions` and listeners.

**Step 3: Run tests**

Run: `pnpm test`
Expected: All tests PASS

**Step 4: Run lint**

Run: `pnpm lint`
Expected: PASS

**Step 5: Commit**

Run: `jj commit -m "refactor: remove notification-based alarm scheduling, AlarmKit replaces it"`

---

### Task 8: Final verification — full test suite and typecheck

**Files:** None (verification only)

**Step 1: Run full test suite**

Run: `pnpm test`
Expected: All tests PASS

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Run lint**

Run: `pnpm lint`
Expected: PASS (or only pre-existing warnings)

**Step 4: Review all changes**

Run: `jj diff -r @---..@` (or appropriate range to see all changes)

Verify:
- No leftover references to old `notificationIds` in store
- No unused imports
- `alarm-kit.ts` is properly tested
- `_layout.tsx` initializes AlarmKit and handles launch payload
- `wakeup.tsx` only plays audio in demo mode
- `notifications.ts` no longer schedules alarms

**Step 5: Commit any final fixes**

Run: `jj commit -m "chore: final cleanup for AlarmKit migration"`

---

## Post-Implementation Notes

**Requires real device testing:**
- `npx expo prebuild` then build to device
- Test: alarm fires in silent mode with app killed
- Test: alarm fires with Focus mode enabled
- Test: alarm dismiss opens app and navigates to wakeup screen
- Test: repeating alarm for multiple weekdays
- Test: nextOverride one-time alarm

**App Group setup:**
- Must be configured in Xcode under Signing & Capabilities → App Groups
- Identifier: `group.com.tktcorporation.goodmorning`

**Sound files:**
- Sound files need to be placed in `Library/Sounds/` at runtime
- This may need a config plugin or runtime copy step (to be validated during device testing)
