# ネイティブ dismiss 時スヌーズスケジュール 設計

## 目的

アラーム dismiss 時にアプリが起動しなくても、スヌーズアラームが確実に鳴るようにする。
現状は JS 側 (`startMorningSession`) でスヌーズをスケジュールしているため、
アプリが起動しないとスヌーズが一切スケジュールされない。

## アーキテクチャ

`AlarmDismissIntent.perform()` (ネイティブ Swift) 内で、
dismiss されたアラームがスヌーズ自身でなければ、20本のスヌーズアラームをスケジュールする。

```
アラーム発火 → ユーザー dismiss
  → AlarmDismissIntent.perform()  [ネイティブ, アプリ未起動でも実行]
    → recordDismissEvent()       （既存）
    → ★ スヌーズ対象か判定
    → ★ 20本のスヌーズをスケジュール
    → ★ スヌーズ ID を App Groups に保存
    → launchPayload 設定          （既存）
    → クリーンアップ              （既存）
```

## 判定ロジック

- `payload` が空 or `isSnooze` を含まない → wake-target アラーム → **スヌーズをスケジュール**
- `payload` に `{"isSnooze":true}` がある → スヌーズ自身 → **スケジュールしない**

## ネイティブ側の変更

### ExpoAlarmKitStorage に追加

```swift
private static let snoozeIdsKey = "ExpoAlarmKit.snoozeAlarmIds"
private static let snoozeInterval: TimeInterval = 540  // 9分
private static let snoozeCount: Int = 20

/// dismiss 時にスヌーズアラームをスケジュールし、ID を永続化する。
public static func scheduleSnoozeAlarms(dismissedAt: Date) async -> [String] {
    var ids: [String] = []
    for i in 1...snoozeCount {
        let uuid = UUID()
        let fireDate = dismissedAt.addingTimeInterval(snoozeInterval * Double(i))
        // AlarmManager.shared.schedule() でスヌーズアラームを登録
        // launchAppOnDismiss: true, dismissPayload: {"isSnooze":true}
        ids.append(uuid.uuidString)
    }
    sharedDefaults?.set(ids, forKey: snoozeIdsKey)
    return ids
}

public static func getSnoozeAlarmIds() -> [String] {
    return sharedDefaults?.stringArray(forKey: snoozeIdsKey) ?? []
}

public static func clearSnoozeAlarmIds() {
    sharedDefaults?.removeObject(forKey: snoozeIdsKey)
}
```

### AlarmDismissIntent.perform() / AlarmDismissIntentWithLaunch.perform() に追加

```swift
// dismiss イベントを永続化（既存）
ExpoAlarmKitStorage.recordDismissEvent(alarmId: self.alarmId, payload: self.payload)

// ★ スヌーズ対象の場合、スヌーズアラームをスケジュール
if !isSnoozePayload(self.payload) {
    await ExpoAlarmKitStorage.scheduleSnoozeAlarms(dismissedAt: Date())
}
```

### ExpoAlarmKitModule に JS 公開関数を追加

```swift
Function("getSnoozeAlarmIds") { () -> [String] in
    return ExpoAlarmKitStorage.getSnoozeAlarmIds()
}

Function("clearSnoozeAlarmIds") { () in
    ExpoAlarmKitStorage.clearSnoozeAlarmIds()
}
```

### isSnoozePayload ヘルパー

```swift
private func isSnoozePayload(_ payload: String?) -> Bool {
    guard let payload = payload, !payload.isEmpty else { return false }
    guard let data = payload.data(using: .utf8),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let isSnooze = json["isSnooze"] as? Bool else { return false }
    return isSnooze
}
```

## JS 側の変更

### alarm-kit.ts に追加

```typescript
export async function getSnoozeAlarmIds(): Promise<readonly string[]> {
    const kit = getAlarmKit();
    if (kit === null) return [];
    const fn = (kit as Record<string, unknown>).getSnoozeAlarmIds;
    if (typeof fn !== 'function') return [];
    return (fn as () => string[])();
}

export async function clearSnoozeAlarmIds(): Promise<void> {
    const kit = getAlarmKit();
    if (kit === null) return;
    const fn = (kit as Record<string, unknown>).clearSnoozeAlarmIds;
    if (typeof fn !== 'function') return;
    (fn as () => void)();
}
```

### session-lifecycle.ts の startMorningSession を変更

**Before:**
```typescript
// 3. スヌーズスケジュール
const snoozeIds = await scheduleSnoozeAlarms(dismissTime);
const snoozeFiresAt = new Date(dismissTime.getTime() + SNOOZE_DURATION_SECONDS * 1000).toISOString();
await useMorningSessionStore.getState().setSnoozeState(snoozeIds, snoozeFiresAt);
```

**After:**
```typescript
// 3. スヌーズ ID をネイティブから読み取る（ネイティブ dismiss 時に既にスケジュール済み）
// フォールバック: ネイティブがスケジュールしていなかった場合は JS 側でスケジュール
const nativeSnoozeIds = await getSnoozeAlarmIds();
let snoozeIds: readonly string[];
if (nativeSnoozeIds.length > 0) {
    snoozeIds = nativeSnoozeIds;
    await clearSnoozeAlarmIds();
} else {
    snoozeIds = await scheduleSnoozeAlarms(dismissTime);
}
const snoozeFiresAt = new Date(dismissTime.getTime() + SNOOZE_DURATION_SECONDS * 1000).toISOString();
await useMorningSessionStore.getState().setSnoozeState(snoozeIds, snoozeFiresAt);
```

## フォールバック戦略

`scheduleSnoozeAlarms` (JS 側) は完全には削除せず、ネイティブがスケジュールしていない場合のフォールバックとして残す。理由:
- ネイティブ側の `AlarmManager.shared.schedule()` が Intent 内で失敗する可能性
- 古い OS バージョンでの互換性

## データフロー

```
ネイティブ dismiss
  → scheduleSnoozeAlarms() → App Groups "ExpoAlarmKit.snoozeAlarmIds" = [id1..id20]
  → recordDismissEvent() → App Groups "ExpoAlarmKit.dismissEvents" = [...]

アプリ起動（JS）
  → startMorningSession()
    → getSnoozeAlarmIds() → [id1..id20] を読み取り
    → clearSnoozeAlarmIds()
    → session.snoozeAlarmIds = [id1..id20]

TODO 全完了（JS）
  → completeMorningSession()
    → cancelAlarmsByIds([id1..id20]) → 残りスヌーズをキャンセル
```

## リスク

- **AlarmManager.shared.schedule() が Intent 内で呼べない場合**: JS フォールバックがある
- **App Groups 書き込みの競合**: dismiss は1回だけ実行されるため安全
- **snoozeAlarmIds の二重読み取り**: clearSnoozeAlarmIds() で読み取り後にクリアする
