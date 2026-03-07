# Native Snooze Scheduling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** アラーム dismiss 時にネイティブ側でスヌーズをスケジュールし、アプリ未起動でもスヌーズが鳴るようにする。

**Architecture:** AlarmDismissIntent.perform() 内でスヌーズ20本をスケジュールし、ID を App Groups に保存。JS 側はアプリ起動時にネイティブから ID を読み取る。JS フォールバックを残してネイティブ失敗時に備える。

**Tech Stack:** Swift (AlarmKit/iOS 26), TypeScript, pnpm patch

---

## 前提知識

### パッチの仕組み
- `patches/expo-alarm-kit@0.1.6.patch` が差分ファイル
- `pnpm install` 時に `.pnpm_patches/` のソースに適用される
- パッチ編集手順: `.pnpm_patches/.../ios/ExpoAlarmKitModule.swift` を直接編集 → `pnpm patch-commit` でパッチ再生成

### 現在の AlarmDismissIntent.perform() (パッチ適用済み)
```swift
public func perform() async throws -> some IntentResult {
    ExpoAlarmKitStorage.recordDismissEvent(alarmId: self.alarmId, payload: self.payload)
    ExpoAlarmKitModule.launchPayload = buildLaunchPayload(alarmId: self.alarmId, payload: self.payload)
    ExpoAlarmKitStorage.removeAlarm(id: self.alarmId)
    ExpoAlarmKitStorage.removeLaunchAppOnDismiss(alarmId: self.alarmId)
    return .result()
}
```

### 重要: 同じ perform() が AlarmDismissIntent と AlarmDismissIntentWithLaunch の2箇所にある
両方を同じように変更すること。

---

### Task 1: ネイティブ — ExpoAlarmKitStorage にスヌーズスケジュール機能を追加

**Files:**
- Modify: `node_modules/.pnpm_patches/expo-alarm-kit@0.1.6/ios/ExpoAlarmKitModule.swift`

**Step 1: ExpoAlarmKitStorage に snooze 定数・メソッドを追加**

`clearDismissEvents()` の後（`}` の前、class 末尾）に以下を追加:

```swift
    // MARK: - Snooze Scheduling
    private static let snoozeIdsKey = "ExpoAlarmKit.snoozeAlarmIds"
    /// 9分間隔。iOS 標準スヌーズと同じ。
    private static let snoozeIntervalSeconds: TimeInterval = 540
    /// 先行スケジュール本数。9分 x 20 = 3時間分。
    private static let snoozeCount: Int = 20

    /// dismiss 時にスヌーズアラームをスケジュールし、ID を App Groups に永続化する。
    /// AlarmDismissIntent.perform() から呼ばれる（アプリ未起動でも実行される）。
    public static func scheduleSnoozeAlarms(dismissedAt: Date) async {
        struct Meta: AlarmMetadata {}
        var ids: [String] = []

        for i in 1...snoozeCount {
            let uuid = UUID()
            let fireDate = dismissedAt.addingTimeInterval(snoozeIntervalSeconds * Double(i))
            let epochSeconds = fireDate.timeIntervalSince1970

            // Stop ボタン: アプリを起動して dismiss する（スヌーズ payload 付き）
            let stopButton = AlarmButton(
                text: LocalizedStringResource(stringLiteral: "Stop"),
                textColor: .white,
                systemImageName: "stop.circle"
            )
            let snoozeButton = AlarmButton(
                text: LocalizedStringResource(stringLiteral: "Snooze"),
                textColor: .white,
                systemImageName: "clock.badge.checkmark"
            )
            let alertPresentation = AlarmPresentation.Alert(
                title: LocalizedStringResource(stringLiteral: "Good Morning"),
                stopButton: stopButton,
                secondaryButton: snoozeButton,
                secondaryButtonBehavior: .countdown
            )
            let presentation = AlarmPresentation(alert: alertPresentation)
            let countdownDuration = Alarm.CountdownDuration(preAlert: nil, postAlert: snoozeIntervalSeconds)
            let attributes = AlarmAttributes<Meta>(
                presentation: presentation,
                metadata: Meta(),
                tintColor: .blue
            )

            // スヌーズ dismiss 時はアプリを起動し、isSnooze payload を付ける
            let stopIntent: any LiveActivityIntent = AlarmDismissIntentWithLaunch(
                alarmId: uuid.uuidString,
                payload: "{\"isSnooze\":true}"
            )

            let config = AlarmManager.AlarmConfiguration<Meta>(
                countdownDuration: countdownDuration,
                schedule: .fixed(fireDate),
                attributes: attributes,
                stopIntent: stopIntent,
                secondaryIntent: nil,
                sound: .default
            )

            do {
                try await AlarmManager.shared.schedule(id: uuid, configuration: config)
                setAlarm(id: uuid.uuidString, value: epochSeconds)
                setLaunchAppOnDismiss(alarmId: uuid.uuidString, value: true)
                ids.append(uuid.uuidString)
            } catch {
                print("[ExpoAlarmKit] Failed to schedule snooze \(i): \(error)")
                // 個別の失敗はスキップして残りを続行
            }
        }

        sharedDefaults?.set(ids, forKey: snoozeIdsKey)
    }

    public static func getSnoozeAlarmIds() -> [String] {
        return sharedDefaults?.stringArray(forKey: snoozeIdsKey) ?? []
    }

    public static func clearSnoozeAlarmIds() {
        sharedDefaults?.removeObject(forKey: snoozeIdsKey)
    }
```

**Step 2: isSnoozePayload ヘルパー関数を追加**

`buildLaunchPayload` の後に追加:

```swift
/// payload JSON に {"isSnooze": true} が含まれているかを判定する。
/// スヌーズ自身の dismiss でスヌーズを再スケジュールしないために使用。
private func isSnoozePayload(_ payload: String?) -> Bool {
    guard let payload = payload, !payload.isEmpty,
          let data = payload.data(using: .utf8),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let isSnooze = json["isSnooze"] as? Bool else {
        return false
    }
    return isSnooze
}
```

**Step 3: AlarmDismissIntent.perform() にスヌーズスケジュールを追加**

`recordDismissEvent` の後、`launchPayload` 設定の前に追加:

```swift
    public func perform() async throws -> some IntentResult {
        // dismiss イベントを永続化（removeAlarm より前に実行）
        ExpoAlarmKitStorage.recordDismissEvent(alarmId: self.alarmId, payload: self.payload)

        // スヌーズ対象のアラーム（= スヌーズ自身ではない）なら、スヌーズを先行スケジュール。
        // アプリ未起動でもスヌーズが確実に鳴るようにする。
        if !isSnoozePayload(self.payload) {
            await ExpoAlarmKitStorage.scheduleSnoozeAlarms(dismissedAt: Date())
        }

        // Store payload for JS to retrieve
        ExpoAlarmKitModule.launchPayload = buildLaunchPayload(alarmId: self.alarmId, payload: self.payload)

        // Clean up App Group storage
        ExpoAlarmKitStorage.removeAlarm(id: self.alarmId)
        ExpoAlarmKitStorage.removeLaunchAppOnDismiss(alarmId: self.alarmId)

        return .result()
    }
```

**Step 4: AlarmDismissIntentWithLaunch.perform() にも同じ変更を適用**

AlarmDismissIntentWithLaunch の perform() にも同じスヌーズスケジュールコードを追加。

**Step 5: ExpoAlarmKitModule に JS 公開関数を追加**

`clearDismissEvents` Function の後に追加:

```swift
        // MARK: - Get Snooze Alarm IDs
        // ネイティブ dismiss 時にスケジュールされたスヌーズの ID を取得する。
        // JS 側の startMorningSession() がセッションに保存するために呼び出す。
        Function("getSnoozeAlarmIds") { () -> [String] in
            return ExpoAlarmKitStorage.getSnoozeAlarmIds()
        }

        // MARK: - Clear Snooze Alarm IDs
        // スヌーズ ID の読み取り後にクリアする。
        Function("clearSnoozeAlarmIds") { () in
            ExpoAlarmKitStorage.clearSnoozeAlarmIds()
        }
```

**Step 6: パッチを再生成**

```bash
cd /workspaces/good-morning
# pnpm_patches のソースを編集済みなので、パッチを再生成
pnpm patch expo-alarm-kit@0.1.6 --edit-dir node_modules/.pnpm_patches/expo-alarm-kit@0.1.6
# 上記で出たパスを使って:
pnpm patch-commit <edit-dir-path>
```

注意: `pnpm patch-commit` の正確なコマンドは pnpm バージョンで異なる。エラーが出たら `pnpm patch` のヘルプを確認。

**Step 7: コミット**

```bash
jj commit -m "feat: ネイティブ dismiss 時にスヌーズアラームをスケジュール"
```

---

### Task 2: JS — alarm-kit.ts にネイティブスヌーズ ID 読み取り API を追加

**Files:**
- Modify: `src/services/alarm-kit.ts`

**Step 1: getSnoozeAlarmIds と clearSnoozeAlarmIds を追加**

`clearDismissEvents` の後に追加:

```typescript
/**
 * ネイティブ dismiss 時にスケジュールされたスヌーズの AlarmKit ID を取得する。
 *
 * 背景: AlarmDismissIntent.perform() がスヌーズ20本をスケジュールし、
 * ID を App Groups に書き込む。JS 側はアプリ起動時にこの ID を読み取り、
 * session.snoozeAlarmIds に保存する（completeMorningSession で ID ベースキャンセルするため）。
 *
 * 呼び出し元: session-lifecycle.ts (startMorningSession)
 */
export function getSnoozeAlarmIds(): readonly string[] {
  const kit = getAlarmKit();
  if (kit === null) return [];
  const fn = (kit as Record<string, unknown>).getSnoozeAlarmIds;
  if (typeof fn !== 'function') return [];
  try {
    return (fn as () => string[])();
  } catch {
    logError('[AlarmKit] getSnoozeAlarmIds failed');
    return [];
  }
}

/**
 * ネイティブ側のスヌーズ ID ストレージをクリアする。
 * getSnoozeAlarmIds() で読み取った後に呼ぶ（二重読み取り防止）。
 *
 * 呼び出し元: session-lifecycle.ts (startMorningSession)
 */
export function clearSnoozeAlarmIds(): void {
  const kit = getAlarmKit();
  if (kit === null) return;
  const fn = (kit as Record<string, unknown>).clearSnoozeAlarmIds;
  if (typeof fn !== 'function') return;
  try {
    (fn as () => void)();
  } catch {
    logError('[AlarmKit] clearSnoozeAlarmIds failed');
  }
}
```

**Step 2: lint 修正**

Run: `pnpm lint:fix`

**Step 3: コミット**

```bash
jj commit -m "feat: ネイティブスヌーズ ID 読み取り API を alarm-kit.ts に追加"
```

---

### Task 3: JS — startMorningSession をネイティブスヌーズ対応に変更

**Files:**
- Modify: `src/services/session-lifecycle.ts`
- Test: `src/__tests__/session-lifecycle.test.ts`

**Step 1: session-lifecycle.ts の import を更新**

`alarm-kit.ts` からの import に `getSnoozeAlarmIds`, `clearSnoozeAlarmIds` を追加:

```typescript
import {
  checkLaunchPayload,
  clearDismissEvents,
  clearSnoozeAlarmIds,
  type NativeDismissEvent,
  getDismissEvents,
  getSnoozeAlarmIds,
} from './alarm-kit';
```

**Step 2: startMorningSession のスヌーズ部分を変更**

Before (現在のコード):
```typescript
  // 3. スヌーズスケジュール（失敗してもセッション続行）
  try {
    const snoozeIds = await scheduleSnoozeAlarms(dismissTime);
    const snoozeFiresAt = new Date(
      dismissTime.getTime() + SNOOZE_DURATION_SECONDS * 1000,
    ).toISOString();
    await useMorningSessionStore.getState().setSnoozeState(snoozeIds, snoozeFiresAt);
  } catch {
    // スヌーズ失敗はログのみ — セッション自体は有効に保つ
  }
```

After:
```typescript
  // 3. スヌーズ ID 取得 — ネイティブ dismiss 時にスケジュール済みの場合はそれを使う。
  // ネイティブがスケジュールしていなかった場合（旧バージョン等）は JS フォールバック。
  try {
    const nativeSnoozeIds = getSnoozeAlarmIds();
    let snoozeIds: readonly string[];
    if (nativeSnoozeIds.length > 0) {
      snoozeIds = nativeSnoozeIds;
      clearSnoozeAlarmIds();
    } else {
      snoozeIds = await scheduleSnoozeAlarms(dismissTime);
    }
    const snoozeFiresAt = new Date(
      dismissTime.getTime() + SNOOZE_DURATION_SECONDS * 1000,
    ).toISOString();
    await useMorningSessionStore.getState().setSnoozeState(snoozeIds, snoozeFiresAt);
  } catch {
    // スヌーズ失敗はログのみ — セッション自体は有効に保つ
  }
```

**Step 3: テストを更新**

`src/__tests__/session-lifecycle.test.ts` の mock に `getSnoozeAlarmIds`, `clearSnoozeAlarmIds` を追加。

alarm-kit mock に追加:
```typescript
jest.mock('../services/alarm-kit', () => ({
  // 既存の mock...
  getSnoozeAlarmIds: jest.fn().mockReturnValue([]),
  clearSnoozeAlarmIds: jest.fn(),
}));
```

jest.requireMock にも追加:
```typescript
const {
  // 既存...
  getSnoozeAlarmIds,
  clearSnoozeAlarmIds,
} = jest.requireMock('../services/alarm-kit') as {
  // 既存の型...
  getSnoozeAlarmIds: jest.Mock;
  clearSnoozeAlarmIds: jest.Mock;
};
```

テストケースを追加:
```typescript
test('uses native snooze IDs when available (native dismiss scheduling)', async () => {
  getSnoozeAlarmIds.mockReturnValueOnce(['native-snooze-1', 'native-snooze-2']);
  const params = createStartParams();

  await startMorningSession(params);

  const session = useMorningSessionStore.getState().session;
  expect(session?.snoozeAlarmIds).toEqual(['native-snooze-1', 'native-snooze-2']);
  // ネイティブ ID があるので JS スケジュールは呼ばれない
  expect(scheduleSnoozeAlarms).not.toHaveBeenCalled();
  // 読み取り後にクリアされること
  expect(clearSnoozeAlarmIds).toHaveBeenCalled();
});

test('falls back to JS scheduling when native snooze IDs are empty', async () => {
  getSnoozeAlarmIds.mockReturnValueOnce([]);
  const params = createStartParams();

  await startMorningSession(params);

  // フォールバック: JS 側でスケジュール
  expect(scheduleSnoozeAlarms).toHaveBeenCalledWith(params.dismissTime);
  expect(clearSnoozeAlarmIds).not.toHaveBeenCalled();
});
```

**Step 4: テスト実行**

Run: `pnpm test --no-coverage`
Expected: ALL PASS

**Step 5: lint 修正 + コミット**

```bash
pnpm lint:fix
jj commit -m "feat: startMorningSession をネイティブスヌーズ ID 対応に変更（JS フォールバック付き）"
```

---

### Task 4: 最終検証

**Step 1: 型チェック**

Run: `pnpm typecheck`
Expected: エラーなし

**Step 2: 全テスト**

Run: `pnpm test --no-coverage`
Expected: ALL PASS

**Step 3: lint**

Run: `pnpm lint`
Expected: 既存の warning のみ

**Step 4: コミット（必要な場合のみ）**

---

## 実装順序の理由

1. **Task 1 (ネイティブ)** — 他タスクの前提。ネイティブ側でスヌーズをスケジュールし、ID を永続化する。
2. **Task 2 (JS API)** — Task 3 が使う API を先に作る。
3. **Task 3 (JS 統合)** — ネイティブ ID の読み取り + JS フォールバック。
4. **Task 4 (最終検証)** — 全体の整合性。

## テストについて

ネイティブ Swift コードは Jest ではテストできない。Task 1 の検証は実機/シミュレーターでの動作確認が必要。
Task 2-3 の JS コードは Jest でテスト可能（ネイティブ関数は動的チェック `typeof fn !== 'function'` でモック不要時は空配列を返す）。
