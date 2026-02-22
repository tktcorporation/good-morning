# Background Alarm Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** アプリがバックグラウンド/キル状態でもアラームが鳴り続けるようにする

**Architecture:** カスタム30秒通知音 + 30秒間隔の連続通知スケジュール + バックグラウンド時の expo-av ループ再生を組み合わせたハイブリッド方式。アプリキル時は OS の通知音（最大30秒 × 5回）、BG 時は通知受信をトリガーに expo-av でループ再生。

**Tech Stack:** expo-notifications (Calendar trigger), expo-av, Zustand, AsyncStorage

---

### Task 1: 30秒カスタム通知音の作成

**Files:**
- Create: `assets/sounds/alarm-notification.caf`
- Modify: `scripts/generate-notification-sound.sh` (optional helper)

**Step 1: 既存の alarm.wav を30秒ループの .caf に変換**

sox か ffmpeg が DevContainer に無いため、Node.js スクリプトで alarm.wav を30秒分ループ結合して .wav として保存する。iOS は .wav も通知音として使えるので .caf 変換は不要。

```bash
node -e "
const fs = require('fs');
const src = fs.readFileSync('assets/sounds/alarm.wav');
// WAV header is 44 bytes, rest is PCM data
const header = src.subarray(0, 44);
const data = src.subarray(44);
const srcDurationApprox = data.length; // raw PCM bytes

// We need ~30 seconds. Repeat data enough times.
// alarm.wav is ~88KB, at 44100Hz 16bit mono = ~2 sec per 88KB data
const repeats = Math.ceil((30 * 44100 * 2) / data.length);
const chunks = [];
for (let i = 0; i < repeats; i++) chunks.push(data);
const allData = Buffer.concat(chunks).subarray(0, 30 * 44100 * 2);

// Update WAV header with new size
const newHeader = Buffer.from(header);
const totalSize = 44 + allData.length - 8;
newHeader.writeUInt32LE(totalSize, 4); // ChunkSize
newHeader.writeUInt32LE(allData.length, 40); // Subchunk2Size

fs.writeFileSync('assets/sounds/alarm-notification.wav', Buffer.concat([newHeader, allData]));
console.log('Created alarm-notification.wav (' + Math.round(allData.length / 44100 / 2) + 's)');
"
```

注意: WAV のサンプルレートやビット深度は元ファイルに依存する。上記は 44100Hz/16bit/mono を仮定。実行後にファイルサイズで妥当性を確認する。

**Step 2: 動作確認**

```bash
ls -la assets/sounds/alarm-notification.wav
# 期待: ~2.6MB (30s * 44100 * 2 bytes)
```

**Step 3: Commit**

```bash
jj commit -m "feat: add 30-second notification sound for background alarm"
```

---

### Task 2: notifications.ts — 連続通知スケジュールの実装

**Files:**
- Modify: `src/services/notifications.ts`
- Test: `src/__tests__/notifications.test.ts` (new)

**Step 1: 繰り返し通知の定数とヘルパーを追加**

`src/services/notifications.ts` の先頭付近に定数を追加:

```typescript
/** Number of repeated notifications per alarm trigger */
const REPEAT_COUNT = 5;
/** Interval between repeated notifications in seconds */
const REPEAT_INTERVAL_SECONDS = 30;
```

**Step 2: scheduleWakeTargetNotifications を修正して連続通知をスケジュール**

既存の `scheduleWakeTargetNotifications` 関数を修正。各曜日の通知を REPEAT_COUNT 回スケジュールする。

Calendar トリガーは秒単位の指定ができるので、0秒、30秒、60秒... と offset する。ただし `expo-notifications` の Calendar trigger は `second` フィールドをサポートしているので、それを使う。

```typescript
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
    sound: 'alarm-notification.wav',
    data: { wakeTarget: true },
  };

  for (let day = 0; day < 7; day++) {
    const dayOfWeek = day as DayOfWeek;
    const testDate = new Date();
    testDate.setDate(testDate.getDate() + ((dayOfWeek - testDate.getDay() + 7) % 7));
    const time = resolveTimeForDate(target, testDate);

    if (time === null) continue;

    const calendarWeekday = dayOfWeekToCalendarWeekday(dayOfWeek);

    for (let i = 0; i < REPEAT_COUNT; i++) {
      const offsetSeconds = i * REPEAT_INTERVAL_SECONDS;
      const totalSeconds = time.minute * 60 + offsetSeconds;
      const triggerMinute = time.hour * 60 + Math.floor(totalSeconds / 60);
      const triggerHour = Math.floor(triggerMinute / 60) % 24;
      const triggerMin = triggerMinute % 60;
      const triggerSec = totalSeconds % 60;

      const trigger: Record<string, unknown> = {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        hour: triggerHour,
        minute: triggerMin,
        second: triggerSec,
        repeats: true,
        weekday: calendarWeekday,
      };

      const id = await Notifications.scheduleNotificationAsync({
        content,
        trigger: trigger as Notifications.NotificationTriggerInput,
      });
      ids.push(id);
    }
  }

  // nextOverride: one-time notifications
  if (target.nextOverride !== null) {
    const time = target.nextOverride.time;
    for (let i = 0; i < REPEAT_COUNT; i++) {
      const offsetSeconds = i * REPEAT_INTERVAL_SECONDS;
      const totalSeconds = time.minute * 60 + offsetSeconds;
      const triggerMinute = time.hour * 60 + Math.floor(totalSeconds / 60);
      const triggerHour = Math.floor(triggerMinute / 60) % 24;
      const triggerMin = triggerMinute % 60;
      const triggerSec = totalSeconds % 60;

      const id = await Notifications.scheduleNotificationAsync({
        content,
        trigger: buildCalendarTrigger(
          { hour: triggerHour, minute: triggerMin },
          undefined,
          triggerSec,
        ),
      });
      ids.push(id);
    }
  }

  return ids;
}
```

`buildCalendarTrigger` に `second` パラメータを追加:

```typescript
function buildCalendarTrigger(
  time: AlarmTime,
  weekday?: number,
  second?: number,
): Notifications.NotificationTriggerInput {
  const trigger: Record<string, unknown> = {
    type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
    hour: time.hour,
    minute: time.minute,
    second: second ?? 0,
    repeats: weekday !== undefined,
  };
  if (weekday !== undefined) {
    trigger.weekday = weekday;
  }
  return trigger as Notifications.NotificationTriggerInput;
}
```

**Step 3: 通知音ファイルの参照を alarm-notification.wav に変更**

content の `sound` を `'alarm-notification.wav'` に変更（Step 2 のコードに含まれている）。

**Step 4: テストを書く**

`src/__tests__/notifications.test.ts` を作成:

```typescript
import * as Notifications from 'expo-notifications';
import { scheduleWakeTargetNotifications, cancelAlarmNotifications } from '../services/notifications';
import type { WakeTarget } from '../types/wake-target';
import { DEFAULT_WAKE_TARGET } from '../types/wake-target';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('mock-id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  addNotificationResponseReceivedListener: jest.fn(),
  addNotificationReceivedListener: jest.fn(),
  SchedulableTriggerInputTypes: { CALENDAR: 'calendar' },
}));

jest.mock('@/i18n', () => ({
  t: (key: string) => key,
}));

const mockSchedule = Notifications.scheduleNotificationAsync as jest.Mock;
const mockCancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;

describe('notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    let counter = 0;
    mockSchedule.mockImplementation(() => Promise.resolve(`id-${++counter}`));
  });

  test('schedules 5 notifications per active day (REPEAT_COUNT=5)', async () => {
    const target: WakeTarget = { ...DEFAULT_WAKE_TARGET, enabled: true };
    const ids = await scheduleWakeTargetNotifications(target, []);
    // 7 days * 5 repeats = 35
    expect(ids.length).toBe(35);
    expect(mockSchedule).toHaveBeenCalledTimes(35);
  });

  test('schedules extra notifications for nextOverride', async () => {
    const target: WakeTarget = {
      ...DEFAULT_WAKE_TARGET,
      nextOverride: { time: { hour: 6, minute: 0 } },
    };
    const ids = await scheduleWakeTargetNotifications(target, []);
    // 7 days * 5 + 1 override * 5 = 40
    expect(ids.length).toBe(40);
  });

  test('cancels existing notifications before scheduling', async () => {
    const existingIds = ['old-1', 'old-2'];
    await scheduleWakeTargetNotifications(DEFAULT_WAKE_TARGET, existingIds);
    expect(mockCancel).toHaveBeenCalledTimes(2);
  });

  test('notification content uses alarm-notification.wav sound', async () => {
    await scheduleWakeTargetNotifications(DEFAULT_WAKE_TARGET, []);
    const firstCall = mockSchedule.mock.calls[0][0];
    expect(firstCall.content.sound).toBe('alarm-notification.wav');
  });

  test('cancelAlarmNotifications cancels all given ids', async () => {
    await cancelAlarmNotifications(['id-1', 'id-2', 'id-3']);
    expect(mockCancel).toHaveBeenCalledTimes(3);
  });
});
```

**Step 5: テスト実行**

```bash
pnpm test -- --testPathPattern=notifications
```

Expected: ALL PASS

**Step 6: Commit**

```bash
jj commit -m "feat: schedule repeated notifications for background alarm"
```

---

### Task 3: wake-target-store — notificationIds の永続化

**Files:**
- Modify: `src/stores/wake-target-store.ts`

**Step 1: notificationIds を AsyncStorage に永続化する**

現状 `notificationIds` は store にあるが永続化されていない。別の storage key で管理する。

`src/stores/wake-target-store.ts` に以下を追加:

```typescript
const NOTIFICATION_IDS_KEY = 'notification-ids';
```

`loadTarget` で notification IDs も読み込む:

```typescript
loadTarget: async () => {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const idsRaw = await AsyncStorage.getItem(NOTIFICATION_IDS_KEY);
  const notificationIds: readonly string[] = idsRaw !== null ? JSON.parse(idsRaw) : [];
  if (raw !== null) {
    const parsed = JSON.parse(raw) as WakeTarget;
    set({ target: parsed, loaded: true, notificationIds });
  } else {
    const fallback: WakeTarget = { ...DEFAULT_WAKE_TARGET, enabled: false };
    set({ target: fallback, loaded: true, notificationIds });
  }
},
```

新しいアクション `setNotificationIds` を追加:

```typescript
setNotificationIds: async (ids: readonly string[]) => {
  set({ notificationIds: ids });
  await AsyncStorage.setItem(NOTIFICATION_IDS_KEY, JSON.stringify(ids));
},
```

interface にも追加:

```typescript
setNotificationIds: (ids: readonly string[]) => Promise<void>;
```

**Step 2: テスト追加**

`src/__tests__/wake-target-store.test.ts` に追加:

```typescript
test('setNotificationIds persists to AsyncStorage', async () => {
  await useWakeTargetStore.getState().setNotificationIds(['id-1', 'id-2']);
  expect(useWakeTargetStore.getState().notificationIds).toEqual(['id-1', 'id-2']);
  expect(mockSetItem).toHaveBeenCalledWith(
    'notification-ids',
    JSON.stringify(['id-1', 'id-2']),
  );
});

test('loadTarget restores notificationIds', async () => {
  mockGetItem.mockImplementation((key: string) => {
    if (key === 'notification-ids') return Promise.resolve(JSON.stringify(['saved-1']));
    return Promise.resolve(null);
  });
  await useWakeTargetStore.getState().loadTarget();
  expect(useWakeTargetStore.getState().notificationIds).toEqual(['saved-1']);
});
```

**Step 3: テスト実行**

```bash
pnpm test -- --testPathPattern=wake-target-store
```

Expected: ALL PASS

**Step 4: Commit**

```bash
jj commit -m "feat: persist notificationIds in AsyncStorage"
```

---

### Task 4: _layout.tsx — バックグラウンド時の即時ループ再生

**Files:**
- Modify: `app/_layout.tsx`

**Step 1: 通知受信リスナーでアラーム音+バイブレーションを即時開始**

`app/_layout.tsx` の `handleAlarmTrigger` を修正:

```typescript
import { Vibration } from 'react-native';
import { playAlarmSound } from '../src/services/sound';
```

```typescript
useEffect(() => {
  const VIBRATION_PATTERN = [500, 1000, 500, 1000];

  const handleAlarmTrigger = () => {
    resetTodos();
    playAlarmSound();
    Vibration.vibrate(VIBRATION_PATTERN, true);
    router.push('/wakeup');
  };

  const responseSub = addNotificationResponseListener(handleAlarmTrigger);
  const receivedSub = addNotificationReceivedListener(handleAlarmTrigger);

  return () => {
    responseSub.remove();
    receivedSub.remove();
  };
}, [router, resetTodos]);
```

これにより、アプリがバックグラウンドにいる時に通知を受信すると、すぐに expo-av でループ再生が始まる。`UIBackgroundModes: ['audio']` が既に設定済みなので、BG でもオーディオ再生が継続する。

**Step 2: wakeup.tsx のアラーム音開始を条件付きに**

`app/wakeup.tsx` の `useEffect` で、既に音が再生中なら二重起動しないように:

```typescript
import { isPlaying, playAlarmSound, stopAlarmSound } from '../src/services/sound';
```

```typescript
useEffect(() => {
  if (isDemo) {
    playAlarmSound();
    const timer = setTimeout(() => {
      stopAlarmSound();
    }, DEMO_SOUND_DURATION_MS);
    return () => {
      clearTimeout(timer);
      stopAlarmSound();
    };
  }

  // _layout.tsx may have already started playback
  if (!isPlaying()) {
    playAlarmSound();
  }
  Vibration.vibrate(VIBRATION_PATTERN, true);

  return () => {
    stopAlarmSound();
    Vibration.cancel();
  };
}, [isDemo]);
```

**Step 3: Commit**

```bash
jj commit -m "feat: start alarm sound immediately on notification received in background"
```

---

### Task 5: wakeup.tsx — Dismiss 時の後続通知キャンセル

**Files:**
- Modify: `app/wakeup.tsx`

**Step 1: store から notificationIds と setNotificationIds を取得**

```typescript
const notificationIds = useWakeTargetStore((s) => s.notificationIds);
const setNotificationIds = useWakeTargetStore((s) => s.setNotificationIds);
```

**Step 2: handleDismiss に後続通知のキャンセルを追加**

`handleDismiss` の先頭、`stopAlarmSound()` の後に:

```typescript
const handleDismiss = useCallback(() => {
  stopAlarmSound();
  Vibration.cancel();

  // Cancel remaining scheduled notifications
  if (notificationIds.length > 0) {
    cancelAlarmNotifications(notificationIds).then(() => {
      setNotificationIds([]);
    });
  }

  // ... rest of existing dismiss logic
}, [target, resolvedTime, todos, isDemo, addRecord, updateRecord, clearNextOverride, router, notificationIds, setNotificationIds]);
```

import 追加:

```typescript
import { cancelAlarmNotifications } from '../src/services/notifications';
```

**Step 3: Commit**

```bash
jj commit -m "feat: cancel remaining notifications on alarm dismiss"
```

---

### Task 6: 通知スケジュールと store の連携

**Files:**
- Modify: `app/_layout.tsx` (or wherever alarm is toggled)
- Modify: `app/(tabs)/index.tsx` (dashboard where toggle exists)

**Step 1: アラーム有効/無効切り替え時に通知を再スケジュール**

現在 `toggleEnabled` が呼ばれた後に通知を再スケジュールする処理が必要。ダッシュボードでの toggle 後に `scheduleWakeTargetNotifications` を呼ぶようにする。

該当箇所を特定するためにダッシュボードを確認し、`toggleEnabled` の呼び出し箇所に通知再スケジュールロジックを追加する。

```typescript
const handleToggle = async () => {
  await toggleEnabled();
  const { target, notificationIds } = useWakeTargetStore.getState();
  if (target !== null && target.enabled) {
    const newIds = await scheduleWakeTargetNotifications(target, notificationIds);
    await setNotificationIds(newIds);
  } else {
    await cancelAlarmNotifications(notificationIds);
    await setNotificationIds([]);
  }
};
```

**Step 2: target 変更時（時刻変更、曜日変更等）にも再スケジュール**

`target-edit.tsx` や `schedule.tsx` での保存時にも同様のロジックを入れる。正確な箇所は実装時にファイルを確認して判断する。

**Step 3: テスト実行 & 型チェック**

```bash
pnpm typecheck
pnpm test
pnpm lint
```

Expected: ALL PASS

**Step 4: Commit**

```bash
jj commit -m "feat: re-schedule notifications on alarm toggle and time changes"
```

---

### Task 7: 最終統合テスト & クリーンアップ

**Step 1: 全テスト実行**

```bash
pnpm test
pnpm typecheck
pnpm lint
```

**Step 2: 手動テストシナリオ（実機で確認）**

1. アラームを設定して有効にする
2. アプリをバックグラウンドに移動 → 通知が来て音が鳴ることを確認
3. アプリを完全にキル → 通知音（30秒）が鳴ることを確認
4. 通知をタップ → /wakeup 画面が開いてループ再生が始まることを確認
5. タスク完了 → dismiss → 後続の通知が来ないことを確認

**Step 3: Final commit**

```bash
jj commit -m "feat: background alarm - integration complete"
```
