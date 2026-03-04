# Native Dismiss Recovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** アラーム dismiss 時にネイティブ側で確実にデータを永続化し、アプリ起動時に WakeRecord + MorningSession + Live Activity を自動復元する

**Architecture:** Swift の `AlarmDismissIntent.perform()` で dismiss イベントを App Groups UserDefaults に書き込み、JS 側の `recoverMissedDismiss()` がアプリ起動時にそれを読み取って WakeRecord 作成 → セッション開始 → Live Activity + スヌーズ開始まで一括実行する。ネイティブ記録がない場合は WakeTarget スケジュールと既存 WakeRecord を照合してフォールバック作成する。

**Tech Stack:** Swift (expo-alarm-kit patch), TypeScript, Zustand, Jest

**Design doc:** この計画自体が設計を含む

---

### Task 1: Swift パッチ — dismiss イベント永続化

`AlarmDismissIntent.perform()` と `AlarmDismissIntentWithLaunch.perform()` で、alarm 情報を消す**前に** dismiss イベントを App Groups UserDefaults に記録する。スヌーズの dismiss/snooze intent は記録しない（スヌーズは既にセッション開始済みのため）。

**Files:**
- Modify: `patches/expo-alarm-kit@0.1.6.patch`

**Step 1: パッチファイルを更新 — ExpoAlarmKitStorage に dismiss イベント記録メソッドを追加**

`ExpoAlarmKitStorage` クラスに以下を追加:

```swift
// MARK: - Dismiss Event Recording
private static let dismissEventsKey = "ExpoAlarmKit.dismissEvents"

/// alarm dismiss 時に呼ばれる。アプリ未起動でも App Groups に永続化される。
/// JS 側が getDismissEvents() で取得し、処理後に clearDismissEvents() でクリアする。
public static func recordDismissEvent(alarmId: String, payload: String?) {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let event: [String: String] = [
        "alarmId": alarmId,
        "dismissedAt": formatter.string(from: Date()),
        "payload": payload ?? "",
    ]
    var events = sharedDefaults?.array(forKey: dismissEventsKey) as? [[String: String]] ?? []
    events.append(event)
    sharedDefaults?.set(events, forKey: dismissEventsKey)
}

public static func getDismissEvents() -> [[String: String]] {
    return sharedDefaults?.array(forKey: dismissEventsKey) as? [[String: String]] ?? []
}

public static func clearDismissEvents() {
    sharedDefaults?.removeObject(forKey: dismissEventsKey)
}
```

**Step 2: AlarmDismissIntent.perform() と AlarmDismissIntentWithLaunch.perform() に記録呼び出しを追加**

```swift
public func perform() async throws -> some IntentResult {
    // dismiss イベントを永続化（removeAlarm より前に実行）
    ExpoAlarmKitStorage.recordDismissEvent(alarmId: self.alarmId, payload: self.payload)

    // 既存処理
    ExpoAlarmKitModule.launchPayload = buildLaunchPayload(alarmId: self.alarmId, payload: self.payload)
    ExpoAlarmKitStorage.removeAlarm(id: self.alarmId)
    ExpoAlarmKitStorage.removeLaunchAppOnDismiss(alarmId: self.alarmId)
    return .result()
}
```

**Note:** `AlarmSnoozeIntent` と `AlarmSnoozeIntentWithLaunch` には追加しない。スヌーズ dismiss 時はセッションが既に存在し、`handleSnoozeArrival()` で処理されるため。

**Step 3: ExpoAlarmKitModule に JS API を追加**

```swift
// MARK: - Get Dismiss Events
Function("getDismissEvents") { () -> [[String: String]] in
    return ExpoAlarmKitStorage.getDismissEvents()
}

// MARK: - Clear Dismiss Events
Function("clearDismissEvents") { () in
    ExpoAlarmKitStorage.clearDismissEvents()
}
```

**Step 4: パッチファイルを再生成**

```bash
cd /home/user/good-morning
# node_modules/expo-alarm-kit/ios/ExpoAlarmKitModule.swift を編集済みの状態で:
pnpm patch expo-alarm-kit --patch-dir patches
```

**Step 5: パッチ適用確認**

```bash
pnpm install
# node_modules/expo-alarm-kit/ios/ExpoAlarmKitModule.swift にパッチが反映されていることを確認
grep -n "recordDismissEvent\|getDismissEvents\|clearDismissEvents" node_modules/expo-alarm-kit/ios/ExpoAlarmKitModule.swift
```

Expected: 3件ヒット（recordDismissEvent, getDismissEvents, clearDismissEvents）

**Step 6: コミット**

```bash
jj commit -m "feat(native): record dismiss events to App Groups UserDefaults

AlarmDismissIntent.perform() で dismiss タイムスタンプを永続化する。
アプリが起動しなくても App Groups に残り、次回起動時に JS 側で取得可能。
スヌーズ intent は除外（セッション既存のため）。"
```

---

### Task 2: TypeScript — dismiss イベント型 + alarm-kit API ラッパー

**Files:**
- Modify: `src/services/alarm-kit.ts`

**Step 1: テスト作成 — getDismissEvents / clearDismissEvents のモック対応**

`src/__tests__/session-lifecycle.test.ts` の alarm-kit モックに追加:

```typescript
// 既存のモックに追加
jest.mock('../services/alarm-kit', () => ({
  // ... 既存のモック ...
  getDismissEvents: jest.fn().mockResolvedValue([]),
  clearDismissEvents: jest.fn().mockResolvedValue(undefined),
}));
```

**Step 2: NativeDismissEvent 型と API ラッパーを alarm-kit.ts に追加**

```typescript
/**
 * ネイティブ AlarmDismissIntent.perform() が App Groups に記録する dismiss イベント。
 *
 * 背景: iOS ではアラーム dismiss 時にアプリが起動しない場合がある。
 * ネイティブ側で dismiss タイムスタンプを永続化し、次回アプリ起動時に
 * recoverMissedDismiss() が読み取って WakeRecord を作成する。
 *
 * ライフサイクル: ネイティブ dismiss 時に作成 → JS recoverMissedDismiss() で消費 → clearDismissEvents() で削除
 */
export interface NativeDismissEvent {
  readonly alarmId: string;
  readonly dismissedAt: string; // ISO 8601
  readonly payload: string;     // "" or JSON (e.g. '{"isSnooze":true}')
}

/**
 * App Groups UserDefaults から未処理の dismiss イベントを取得する。
 * ネイティブモジュールが利用不可の場合は空配列を返す。
 */
export async function getDismissEvents(): Promise<readonly NativeDismissEvent[]> {
  const kit = getAlarmKit();
  if (kit === null) return [];
  const fn = (kit as Record<string, unknown>).getDismissEvents;
  if (typeof fn !== 'function') return [];
  try {
    return (fn as () => NativeDismissEvent[])();
  } catch (e) {
    logError('[AlarmKit] getDismissEvents failed:', e);
    return [];
  }
}

/**
 * 処理済みの dismiss イベントを App Groups から削除する。
 * recoverMissedDismiss() の最後に呼ばれる。
 */
export async function clearDismissEvents(): Promise<void> {
  const kit = getAlarmKit();
  if (kit === null) return;
  const fn = (kit as Record<string, unknown>).clearDismissEvents;
  if (typeof fn !== 'function') return;
  try {
    (fn as () => void)();
  } catch (e) {
    logError('[AlarmKit] clearDismissEvents failed:', e);
  }
}
```

**Step 3: コミット**

```bash
jj commit -m "feat: add getDismissEvents/clearDismissEvents JS wrappers

NativeDismissEvent 型と alarm-kit.ts ラッパー関数を追加。
ネイティブの getDismissEvents/clearDismissEvents を呼び出す。"
```

---

### Task 3: recoverMissedDismiss() — セッション復元ロジック

ネイティブ dismiss イベントから WakeRecord + MorningSession + スヌーズ + Live Activity を復元する。

**Files:**
- Modify: `src/services/session-lifecycle.ts`
- Modify: `src/__tests__/session-lifecycle.test.ts`

**Step 1: Failing test を書く**

```typescript
// src/__tests__/session-lifecycle.test.ts

// alarm-kit モックに getDismissEvents, clearDismissEvents を追加（Task 2 で追加済み）

import { recoverMissedDismiss } from '../services/session-lifecycle';

describe('recoverMissedDismiss', () => {
  test('creates record + session from native dismiss event (TODO あり target)', async () => {
    const target = createTargetWithTodos();
    useWakeTargetStore.setState({ target, alarmIds: [], loaded: true });

    const getDismissEvents = jest.requireMock('../services/alarm-kit').getDismissEvents as jest.Mock;
    const clearDismissEvents = jest.requireMock('../services/alarm-kit').clearDismissEvents as jest.Mock;
    getDismissEvents.mockResolvedValueOnce([
      { alarmId: 'alarm-1', dismissedAt: '2026-03-04T07:02:00.000Z', payload: '' },
    ]);

    const result = await recoverMissedDismiss(4);

    // WakeRecord が作成されること
    const records = useWakeRecordStore.getState().records;
    expect(records).toHaveLength(1);
    expect(records[0]?.dismissedAt).toBe('2026-03-04T07:02:00.000Z');
    expect(records[0]?.alarmId).toBe('wake-target');

    // セッションが作成されること
    const session = useMorningSessionStore.getState().session;
    expect(session).not.toBeNull();
    expect(session?.todos).toHaveLength(2);

    // スヌーズがスケジュールされること
    expect(scheduleSnoozeAlarms).toHaveBeenCalled();

    // Live Activity が開始されること
    expect(startLiveActivity).toHaveBeenCalled();

    // dismiss イベントがクリアされること
    expect(clearDismissEvents).toHaveBeenCalled();

    // result が true（復元された）
    expect(result).toBe(true);
  });

  test('creates only record for TODO なし target', async () => {
    const target = createTargetWithoutTodos();
    useWakeTargetStore.setState({ target, alarmIds: [], loaded: true });

    const getDismissEvents = jest.requireMock('../services/alarm-kit').getDismissEvents as jest.Mock;
    getDismissEvents.mockResolvedValueOnce([
      { alarmId: 'alarm-1', dismissedAt: '2026-03-04T07:02:00.000Z', payload: '' },
    ]);

    const result = await recoverMissedDismiss(4);

    // WakeRecord は作成される
    expect(useWakeRecordStore.getState().records).toHaveLength(1);
    // セッションは作成されない
    expect(useMorningSessionStore.getState().session).toBeNull();
    // result は true
    expect(result).toBe(true);
  });

  test('skips snooze dismiss events', async () => {
    const target = createTargetWithTodos();
    useWakeTargetStore.setState({ target, alarmIds: [], loaded: true });

    const getDismissEvents = jest.requireMock('../services/alarm-kit').getDismissEvents as jest.Mock;
    getDismissEvents.mockResolvedValueOnce([
      { alarmId: 'snooze-1', dismissedAt: '2026-03-04T07:11:00.000Z', payload: '{"isSnooze":true}' },
    ]);

    const result = await recoverMissedDismiss(4);

    // スヌーズ dismiss はスキップ
    expect(useWakeRecordStore.getState().records).toHaveLength(0);
    expect(result).toBe(false);
  });

  test('skips when session already active', async () => {
    setActiveSession();
    const target = createTargetWithTodos();
    useWakeTargetStore.setState({ target, alarmIds: [], loaded: true });

    const getDismissEvents = jest.requireMock('../services/alarm-kit').getDismissEvents as jest.Mock;
    getDismissEvents.mockResolvedValueOnce([
      { alarmId: 'alarm-1', dismissedAt: '2026-03-04T07:02:00.000Z', payload: '' },
    ]);

    const result = await recoverMissedDismiss(4);

    // セッションがアクティブなので新たな WakeRecord は作成しない
    expect(useWakeRecordStore.getState().records).toHaveLength(0);
    expect(result).toBe(false);
  });

  test('skips when same date record already exists', async () => {
    const target = createTargetWithTodos();
    useWakeTargetStore.setState({ target, alarmIds: [], loaded: true });

    // 同日のレコードを事前に作成
    await useWakeRecordStore.getState().addRecord({
      alarmId: 'wake-target',
      date: '2026-03-04',
      targetTime: { hour: 7, minute: 0 },
      alarmTriggeredAt: '2026-03-04T07:00:00.000Z',
      dismissedAt: '2026-03-04T07:01:00.000Z',
      healthKitWakeTime: null,
      result: 'great',
      diffMinutes: 1,
      todos: [],
      todoCompletionSeconds: 0,
      alarmLabel: '',
      todosCompleted: true,
      todosCompletedAt: '2026-03-04T07:01:00.000Z',
      goalDeadline: null,
    });

    const getDismissEvents = jest.requireMock('../services/alarm-kit').getDismissEvents as jest.Mock;
    getDismissEvents.mockResolvedValueOnce([
      { alarmId: 'alarm-1', dismissedAt: '2026-03-04T07:02:00.000Z', payload: '' },
    ]);

    const result = await recoverMissedDismiss(4);

    // 同日レコードが既にあるので追加作成しない（元の1件のまま）
    expect(useWakeRecordStore.getState().records).toHaveLength(1);
    expect(result).toBe(false);
  });

  test('returns false when no dismiss events', async () => {
    const getDismissEvents = jest.requireMock('../services/alarm-kit').getDismissEvents as jest.Mock;
    getDismissEvents.mockResolvedValueOnce([]);

    const result = await recoverMissedDismiss(4);
    expect(result).toBe(false);
  });
});
```

**Step 2: テストを実行して失敗を確認**

```bash
pnpm test -- --testPathPattern=session-lifecycle
```

Expected: `recoverMissedDismiss is not a function` で FAIL

**Step 3: recoverMissedDismiss を実装**

```typescript
// src/services/session-lifecycle.ts に追加

import {
  // 既存の import に追加:
  getDismissEvents,
  clearDismissEvents,
  type NativeDismissEvent,
} from './alarm-kit';
import { resolveTimeForDate } from '../types/wake-target';

/**
 * アプリ起動時にネイティブ dismiss イベントを確認し、未処理のものから
 * WakeRecord + MorningSession を復元する。
 *
 * 背景: iOS ではアラーム dismiss 時にアプリが起動しない場合がある。
 * ネイティブ側が App Groups に記録した dismiss タイムスタンプを使い、
 * 正確な起床データを復元する。セッション開始後はスヌーズと Live Activity も
 * 開始して通常の朝フローに合流する。
 *
 * 呼び出し元: app/_layout.tsx（初期化時、checkLaunchPayload の前）
 *
 * @returns true if a session was recovered, false otherwise
 */
export async function recoverMissedDismiss(dayBoundaryHour: number): Promise<boolean> {
  // セッションが既にアクティブなら何もしない
  if (useMorningSessionStore.getState().isActive()) {
    await clearDismissEvents();
    return false;
  }

  const events = await getDismissEvents();
  if (events.length === 0) return false;

  // スヌーズ dismiss はスキップ（セッション既存のため handleSnoozeArrival で処理済み）
  const primaryEvents = events.filter((e) => !isSnoozeEvent(e));
  if (primaryEvents.length === 0) {
    await clearDismissEvents();
    return false;
  }

  // 最新のプライマリ dismiss イベントを使用
  const event = primaryEvents[primaryEvents.length - 1]!;
  const dismissTime = new Date(event.dismissedAt);
  const dateStr = getLogicalDateString(dismissTime, dayBoundaryHour);

  // 同日のレコードが既にある場合はスキップ（wakeup 画面経由で作成済み）
  const { records } = useWakeRecordStore.getState();
  if (records.some((r) => r.date === dateStr)) {
    await clearDismissEvents();
    return false;
  }

  // WakeTarget を取得（復元に必要な TODO リスト等）
  const { target } = useWakeTargetStore.getState();
  if (target === null) {
    await clearDismissEvents();
    return false;
  }

  // resolvedTime: dismiss 時点の曜日に対応するアラーム時刻
  const resolvedTime = resolveTimeForDate(target, dismissTime);
  if (resolvedTime === null) {
    await clearDismissEvents();
    return false;
  }

  // startMorningSession と同等のロジックで WakeRecord + セッションを作成
  // ただし mountedAt は不明なので dismissedAt で代用する
  await startMorningSession({
    target,
    resolvedTime,
    dismissTime,
    mountedAt: dismissTime, // wakeup 画面未経由のため dismissTime で近似
    dayBoundaryHour,
  });

  await clearDismissEvents();
  return true;
}

/**
 * NativeDismissEvent がスヌーズ由来かどうかを判定する。
 * スヌーズアラームは dismissPayload に { isSnooze: true } を埋め込んでいる。
 */
function isSnoozeEvent(event: NativeDismissEvent): boolean {
  if (event.payload === '') return false;
  try {
    const parsed = JSON.parse(event.payload) as { isSnooze?: boolean };
    return parsed.isSnooze === true;
  } catch {
    return false;
  }
}
```

**Step 4: テストを実行して全て PASS を確認**

```bash
pnpm test -- --testPathPattern=session-lifecycle
```

Expected: ALL PASS

**Step 5: コミット**

```bash
jj commit -m "feat: add recoverMissedDismiss for deferred session recovery

ネイティブ dismiss イベントからWakeRecord + MorningSession + スヌーズ +
Live Activity を復元する。アプリが起動しなかった場合のセーフティネット。
同日レコード重複チェック、スヌーズイベントスキップ、セッション競合チェック付き。"
```

---

### Task 4: _layout.tsx — 復元フローの統合

`_layout.tsx` の初期化 effect に `recoverMissedDismiss()` を組み込む。

**Files:**
- Modify: `app/_layout.tsx`

**Step 1: import 追加 + 初期化 effect の修正**

```typescript
// import に追加
import { handleSnoozeArrival, recoverMissedDismiss, restoreSessionOnLaunch } from '../src/services/session-lifecycle';
```

初期化 effect の `payload === null`（通常起動）分岐に追加:

```typescript
} else {
  // アラーム経由でない通常起動。
  Promise.all([coreLoaded, targetLoaded]).then(async () => {
    restoreSessionOnLaunch(useSettingsStore.getState().dayBoundaryHour);
    useWakeTargetStore.getState().clearExpiredOverride();

    // ネイティブ dismiss イベントを確認し、未処理の dismiss があれば
    // WakeRecord + セッションを自動復元する。
    // アラーム dismiss 時にアプリが起動しなかった場合のセーフティネット。
    const recovered = await recoverMissedDismiss(
      useSettingsStore.getState().dayBoundaryHour,
    );
    if (recovered) {
      // セッションが復元された → ダッシュボードに遷移して TODO フローを開始
      router.push('/');
    }
  });
}
```

**`handleAlarmResume` にも追加（バックグラウンド復帰時）:**

```typescript
function handleAlarmResume(routerPush: (path: string) => void): void {
  const resumePayload = checkLaunchPayload();
  if (resumePayload === null) {
    // ペイロードなし = アラーム経由でない復帰だが、
    // ネイティブ dismiss イベントが溜まっている可能性がある
    recoverMissedDismiss(useSettingsStore.getState().dayBoundaryHour).then((recovered) => {
      if (recovered) routerPush('/');
    });
    return;
  }

  if (isSnoozePayload(resumePayload)) {
    handleSnoozeArrival();
  } else if (!useMorningSessionStore.getState().isActive()) {
    restoreSessionOnLaunch(useSettingsStore.getState().dayBoundaryHour);
    routerPush('/wakeup');
  }
}
```

**Step 2: テスト実行**

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Expected: ALL PASS

**Step 3: コミット**

```bash
jj commit -m "feat: integrate recoverMissedDismiss in app initialization

通常起動時とバックグラウンド復帰時にネイティブ dismiss イベントを確認し、
セッションを自動復元する。復元後はダッシュボードに遷移してTODOフローに合流。"
```

---

### Task 5: 型チェック・リント・テスト全体確認

**Step 1: 全テスト実行**

```bash
pnpm test
```

Expected: ALL PASS

**Step 2: 型チェック**

```bash
pnpm typecheck
```

Expected: 0 errors

**Step 3: リント**

```bash
pnpm lint
```

Expected: 0 errors

**Step 4: コミット（必要な修正があれば）**

---

### Task 6: jj git push

```bash
jj bookmark create claude/fix-sleep-alarm-data-2vIHC
jj git push
```
