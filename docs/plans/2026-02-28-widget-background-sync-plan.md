# ホームウィジェット + Background Fetch 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** ホーム画面ウィジェット（Small/Medium/Large）を追加し、Background Fetch でウィジェットデータを定期同期 + バックグラウンドグレード確定を行う。

**Architecture:** メインアプリが Zustand ストア変更時に App Groups UserDefaults にデータを書き出し、Widget Extension の `TimelineProvider` がそれを読み取る。`expo-background-fetch` で定期的にデータを再同期し、WidgetCenter のタイムラインを更新する。

**Tech Stack:** Expo SDK 54, React Native, Zustand, WidgetKit (SwiftUI), expo-alarm-kit (native module), expo-task-manager + expo-background-fetch

**設計書:** `docs/plans/2026-02-28-widget-background-sync-design.md`

---

## Task 1: WidgetData 型定義 + JS → Native ブリッジ

expo-alarm-kit に `syncWidgetData()` と `reloadWidgetTimelines()` を追加する。
ネイティブモジュールが利用不可の場合は no-op で安全にフォールバックする。

**Files:**
- Create: `src/types/widget-data.ts`
- Create: `src/services/widget-sync.ts`
- Modify: `src/services/alarm-kit.ts`
- Test: `src/__tests__/widget-sync.test.ts`

### Step 1: WidgetData 型を定義

```typescript
// src/types/widget-data.ts
export interface WidgetTodo {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}

export interface WidgetData {
  readonly nextAlarm: {
    readonly time: string;      // "HH:mm"
    readonly enabled: boolean;
    readonly label: string;     // 曜日ラベル（例: "月"）
  } | null;
  readonly session: {
    readonly todos: readonly WidgetTodo[];
    readonly snoozeFiresAt: string | null;
    readonly progress: { readonly completed: number; readonly total: number };
  } | null;
  readonly streak: {
    readonly currentStreak: number;
    readonly lastGrade: string;  // DailyGrade
  };
  readonly updatedAt: string;
}
```

### Step 2: alarm-kit.ts にネイティブブリッジ関数を追加

`src/services/alarm-kit.ts` の末尾（`checkLaunchPayload` の後）に追加:

```typescript
/**
 * App Groups UserDefaults にウィジェット表示用データを書き込む。
 * Widget Extension がこのデータを読み取ってタイムラインを生成する。
 * ネイティブモジュールが利用不可の場合は no-op。
 */
export async function syncWidgetData(jsonString: string): Promise<void> {
  const kit = getAlarmKit();
  if (kit === null) return;
  const fn = kit.syncWidgetData;
  if (typeof fn !== 'function') return;
  try {
    await fn(APP_GROUP_ID, jsonString);
  } catch (e) {
    logError('[AlarmKit] syncWidgetData failed:', e);
  }
}

/**
 * WidgetCenter.shared.reloadAllTimelines() を呼び出して全ウィジェットを更新する。
 * syncWidgetData() の後に呼ぶ。ネイティブモジュールが利用不可の場合は no-op。
 */
export async function reloadWidgetTimelines(): Promise<void> {
  const kit = getAlarmKit();
  if (kit === null) return;
  const fn = kit.reloadWidgetTimelines;
  if (typeof fn !== 'function') return;
  try {
    await fn();
  } catch (e) {
    logError('[AlarmKit] reloadWidgetTimelines failed:', e);
  }
}
```

### Step 3: widget-sync.ts — ストアからウィジェットデータを組み立てて同期するサービス

```typescript
// src/services/widget-sync.ts
import type { DayOfWeek } from '../types/alarm';
import { formatTime } from '../types/alarm';
import type { WidgetData } from '../types/widget-data';
import { resolveTimeForDate } from '../types/wake-target';
import { syncWidgetData, reloadWidgetTimelines } from './alarm-kit';
import { useDailyGradeStore } from '../stores/daily-grade-store';
import { useMorningSessionStore } from '../stores/morning-session-store';
import { useWakeTargetStore } from '../stores/wake-target-store';

/** 曜日インデックス → 短縮ラベル。i18n は Widget Extension 側で不使用のため固定値。 */
const DAY_LABELS: Record<DayOfWeek, string> = {
  0: '日', 1: '月', 2: '火', 3: '水', 4: '木', 5: '金', 6: '土',
};

/**
 * 全ストアの現在状態から WidgetData を組み立てる。
 * ストア外から呼べるようにステートレスな pure 関数として実装。
 */
export function buildWidgetData(): WidgetData {
  const target = useWakeTargetStore.getState().target;
  const sessionState = useMorningSessionStore.getState();
  const { streak } = useDailyGradeStore.getState();

  // --- nextAlarm ---
  let nextAlarm: WidgetData['nextAlarm'] = null;
  if (target !== null) {
    const now = new Date();
    const alarmTime = resolveTimeForDate(target, now);
    if (alarmTime !== null) {
      nextAlarm = {
        time: formatTime(alarmTime),
        enabled: target.enabled,
        label: DAY_LABELS[now.getDay() as DayOfWeek],
      };
    }
  }

  // --- session ---
  let session: WidgetData['session'] = null;
  if (sessionState.session !== null) {
    const { completed, total } = sessionState.getProgress();
    session = {
      todos: sessionState.session.todos.map((t) => ({
        id: t.id,
        title: t.title,
        completed: t.completed,
      })),
      snoozeFiresAt: sessionState.snoozeFiresAt,
      progress: { completed, total },
    };
  }

  return {
    nextAlarm,
    session,
    streak: {
      currentStreak: streak.currentStreak,
      lastGrade: streak.lastGradedDate !== null
        ? (useDailyGradeStore.getState().getGradeForDate(streak.lastGradedDate)?.grade ?? 'poor')
        : 'poor',
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * ウィジェットデータを App Groups UserDefaults に同期し、タイムラインを更新する。
 * ストア変更のコールバックから fire-and-forget で呼ぶ。
 * 失敗してもアプリ動作に影響しないため、エラーはログのみ。
 */
export async function syncWidget(): Promise<void> {
  const data = buildWidgetData();
  await syncWidgetData(JSON.stringify(data));
  await reloadWidgetTimelines();
}
```

### Step 4: テストを書く

```typescript
// src/__tests__/widget-sync.test.ts
import { useDailyGradeStore } from '../stores/daily-grade-store';
import { useMorningSessionStore } from '../stores/morning-session-store';
import { useWakeTargetStore } from '../stores/wake-target-store';
import { buildWidgetData } from '../services/widget-sync';
import type { WidgetData } from '../types/widget-data';

// alarm-kit は native module なのでモック
jest.mock('../services/alarm-kit', () => ({
  syncWidgetData: jest.fn(),
  reloadWidgetTimelines: jest.fn(),
  APP_GROUP_ID: 'group.test',
}));

// AsyncStorage モック
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

const sampleTodos = [
  { id: 'todo_1', title: '水を飲む', completed: false, completedAt: null },
  { id: 'todo_2', title: 'ストレッチ', completed: false, completedAt: null },
];

beforeEach(() => {
  // ストアをリセット
  useWakeTargetStore.setState({ target: null, loaded: false, alarmIds: [] });
  useMorningSessionStore.setState({ session: null, loaded: false, snoozeAlarmIds: [], snoozeFiresAt: null });
  useDailyGradeStore.setState({ grades: [], streak: { currentStreak: 0, longestStreak: 0, freezesAvailable: 0, freezesUsedTotal: 0, lastGradedDate: null }, loaded: false });
});

test('returns null nextAlarm when no target', () => {
  const data = buildWidgetData();
  expect(data.nextAlarm).toBeNull();
});

test('returns nextAlarm with time when target exists', () => {
  useWakeTargetStore.setState({
    target: { defaultTime: { hour: 6, minute: 30 }, dayOverrides: {}, nextOverride: null, todos: [], enabled: true, soundId: 'default', targetSleepMinutes: null },
    loaded: true,
    alarmIds: [],
  });
  const data = buildWidgetData();
  expect(data.nextAlarm).not.toBeNull();
  expect(data.nextAlarm?.time).toBe('06:30');
  expect(data.nextAlarm?.enabled).toBe(true);
});

test('returns null session when no active session', () => {
  const data = buildWidgetData();
  expect(data.session).toBeNull();
});

test('returns session with progress when session active', async () => {
  await useMorningSessionStore.getState().startSession('rec_1', '2026-02-28', sampleTodos);
  const data = buildWidgetData();
  expect(data.session).not.toBeNull();
  expect(data.session?.progress).toEqual({ completed: 0, total: 2 });
  expect(data.session?.todos).toHaveLength(2);
});

test('returns streak from daily grade store', () => {
  useDailyGradeStore.setState({
    grades: [],
    streak: { currentStreak: 5, longestStreak: 10, freezesAvailable: 1, freezesUsedTotal: 2, lastGradedDate: null },
    loaded: true,
  });
  const data = buildWidgetData();
  expect(data.streak.currentStreak).toBe(5);
});

test('updatedAt is a valid ISO string', () => {
  const data = buildWidgetData();
  expect(() => new Date(data.updatedAt)).not.toThrow();
  expect(new Date(data.updatedAt).toISOString()).toBe(data.updatedAt);
});
```

### Step 5: テスト実行

Run: `pnpm test -- --testPathPattern widget-sync`
Expected: 全テスト PASS

### Step 6: コミット

```bash
jj commit -m "feat: WidgetData 型定義 + widget-sync サービス + alarm-kit ブリッジ関数

App Groups UserDefaults 経由でメインアプリと Widget Extension がデータを共有するための基盤。
buildWidgetData() で全ストアから WidgetData を組み立て、
syncWidgetData() で UserDefaults に書き出し、reloadWidgetTimelines() でウィジェットを更新する。"
```

---

## Task 2: ストア変更時の自動同期フック

各ストアの変更メソッドに `syncWidget()` の fire-and-forget 呼び出しを追加する。
同期失敗はアプリ動作に影響しないため `.catch()` でログのみ。

**Files:**
- Modify: `src/stores/wake-target-store.ts`
- Modify: `src/stores/morning-session-store.ts`
- Modify: `src/stores/daily-grade-store.ts`
- Test: 既存テストが破壊されないことを確認

### Step 1: wake-target-store に syncWidget 呼び出しを追加

`src/stores/wake-target-store.ts` の先頭に import 追加:

```typescript
import { syncWidget } from '../services/widget-sync';
```

以下のメソッドの末尾（`await persistTarget(...)` の後）に追加:

- `setTarget()` — target 全体変更
- `updateDefaultTime()` — デフォルト時刻変更
- `setNextOverride()` — 明日だけオーバーライド
- `clearNextOverride()` — オーバーライドクリア
- `setDayOverride()` — 曜日オーバーライド
- `removeDayOverride()` — 曜日オーバーライド削除
- `toggleEnabled()` — アラーム有効/無効

各メソッドの `await persistTarget(updated)` の後に:

```typescript
// ウィジェットに最新のアラーム情報を反映（fire-and-forget）
syncWidget().catch(() => {});
```

### Step 2: morning-session-store に syncWidget 呼び出しを追加

`src/stores/morning-session-store.ts` の先頭に import 追加:

```typescript
import { syncWidget } from '../services/widget-sync';
```

以下のメソッドの `await persistSession(...)` / `set(...)` の後に追加:

- `startSession()` — `await persistSession(session)` の後
- `toggleTodo()` — `await persistSession(updated)` の後
- `clearSession()` — `await persistSession(null)` の後

```typescript
syncWidget().catch(() => {});
```

### Step 3: daily-grade-store に syncWidget 呼び出しを追加

`src/stores/daily-grade-store.ts` の先頭に import 追加:

```typescript
import { syncWidget } from '../services/widget-sync';
```

`addGrade()` メソッドの `await persistAll(...)` の後に追加:

```typescript
syncWidget().catch(() => {});
```

### Step 4: 既存テスト実行

Run: `pnpm test`
Expected: 全テスト PASS（syncWidget は alarm-kit 経由で no-op にフォールバックするため既存テストに影響なし）

### Step 5: 型チェック

Run: `pnpm typecheck`
Expected: エラーなし

### Step 6: コミット

```bash
jj commit -m "feat: ストア変更時にウィジェットデータを自動同期

wake-target-store, morning-session-store, daily-grade-store の
状態変更メソッドに syncWidget() の fire-and-forget 呼び出しを追加。
ストア変更 → App Groups UserDefaults 書き出し → WidgetCenter タイムライン更新
のパイプラインが自動で発火する。"
```

---

## Task 3: expo-alarm-kit ネイティブモジュール拡張

Swift 側に `syncWidgetData()` と `reloadWidgetTimelines()` メソッドを実装する。

**Files:**
- Modify: expo-alarm-kit の Swift ソース（`node_modules/expo-alarm-kit/ios/` 配下）
  - 注意: expo-alarm-kit はローカルパッケージ。ソースパスは `node_modules/expo-alarm-kit/ios/ExpoAlarmKitModule.swift` を確認して特定すること
- Alternative: expo module としてパッチを当てるか、別の config plugin で対応

### Step 1: ネイティブモジュールのソース場所を確認

Run: `find node_modules/expo-alarm-kit/ios -name "*.swift" | head -20`
→ モジュールの Swift ファイルの場所を特定する

### Step 2: ExpoAlarmKitModule に 2 メソッドを追加

```swift
// syncWidgetData: App Groups UserDefaults に JSON 文字列を書き込む
AsyncFunction("syncWidgetData") { (groupId: String, jsonString: String) in
    guard let defaults = UserDefaults(suiteName: groupId) else {
        throw NSError(domain: "ExpoAlarmKit", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid app group: \(groupId)"])
    }
    defaults.set(jsonString, forKey: "widget-data")
    defaults.synchronize()
}

// reloadWidgetTimelines: 全ウィジェットのタイムラインをリロード
AsyncFunction("reloadWidgetTimelines") {
    if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
    }
}
```

必要な import:

```swift
import WidgetKit  // reloadAllTimelines に必要
```

### Step 3: ビルド確認

expo-alarm-kit がローカルパッケージの場合、EAS Build または `npx expo prebuild` で確認する。
DevContainer 内でネイティブビルドが不可の場合は、型チェック + テストのみで確認し、実機テストは別途行う。

### Step 4: コミット

```bash
jj commit -m "feat(expo-alarm-kit): syncWidgetData + reloadWidgetTimelines ネイティブメソッド追加

App Groups UserDefaults への JSON 書き込みと WidgetCenter タイムライン更新の
ネイティブブリッジ。JS 側の syncWidget() から呼ばれる。"
```

---

## Task 4: Widget Extension — SharedTypes + TimelineProvider

Widget Extension に `WidgetData` の Swift 型と `TimelineProvider` を実装する。

**Files:**
- Create: `ios/GoodMorningWidgetExtension/SharedTypes.swift`
- Create: `ios/GoodMorningWidgetExtension/AlarmWidgetTimelineProvider.swift`

### Step 1: SharedTypes.swift — WidgetData の Swift Codable 定義

```swift
// ios/GoodMorningWidgetExtension/SharedTypes.swift
import Foundation

/// JS 側の WidgetData と同じ構造。App Groups UserDefaults 経由で JSON として共有。
struct WidgetData: Codable {
    let nextAlarm: NextAlarmData?
    let session: SessionData?
    let streak: StreakData
    let updatedAt: String
}

struct NextAlarmData: Codable {
    let time: String      // "HH:mm"
    let enabled: Bool
    let label: String     // 曜日ラベル
}

struct SessionData: Codable {
    let todos: [WidgetTodoData]
    let snoozeFiresAt: String?
    let progress: ProgressData
}

struct WidgetTodoData: Codable {
    let id: String
    let title: String
    let completed: Bool
}

struct ProgressData: Codable {
    let completed: Int
    let total: Int
}

struct StreakData: Codable {
    let currentStreak: Int
    let lastGrade: String
}

// MARK: - UserDefaults Reader

extension WidgetData {
    /// App Groups UserDefaults から WidgetData を読み取る。データがなければ nil。
    static func load(groupId: String) -> WidgetData? {
        guard let defaults = UserDefaults(suiteName: groupId),
              let jsonString = defaults.string(forKey: "widget-data"),
              let data = jsonString.data(using: .utf8) else {
            return nil
        }
        return try? JSONDecoder().decode(WidgetData.self, from: data)
    }
}
```

### Step 2: AlarmWidgetTimelineProvider.swift

```swift
// ios/GoodMorningWidgetExtension/AlarmWidgetTimelineProvider.swift
import WidgetKit
import SwiftUI

struct AlarmWidgetEntry: TimelineEntry {
    let date: Date
    let widgetData: WidgetData?
}

struct AlarmWidgetTimelineProvider: TimelineProvider {
    private let groupId = "group.com.tktcorporation.goodmorning"

    func placeholder(in context: Context) -> AlarmWidgetEntry {
        AlarmWidgetEntry(date: Date(), widgetData: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (AlarmWidgetEntry) -> Void) {
        let data = WidgetData.load(groupId: groupId)
        completion(AlarmWidgetEntry(date: Date(), widgetData: data))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<AlarmWidgetEntry>) -> Void) {
        let data = WidgetData.load(groupId: groupId)
        let now = Date()
        let entry = AlarmWidgetEntry(date: now, widgetData: data)

        // 次のアラーム時刻で自動更新。なければ1時間後。
        let nextUpdate: Date
        if let alarmTime = data?.nextAlarm?.time, data?.nextAlarm?.enabled == true {
            nextUpdate = Self.nextAlarmDate(timeString: alarmTime, after: now) ?? now.addingTimeInterval(3600)
        } else {
            nextUpdate = now.addingTimeInterval(3600)
        }

        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }

    /// "HH:mm" 文字列から次のアラーム Date を算出。
    private static func nextAlarmDate(timeString: String, after now: Date) -> Date? {
        let parts = timeString.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { return nil }
        let calendar = Calendar.current
        var components = calendar.dateComponents([.year, .month, .day], from: now)
        components.hour = parts[0]
        components.minute = parts[1]
        components.second = 0
        guard let candidate = calendar.date(from: components) else { return nil }
        return candidate > now ? candidate : calendar.date(byAdding: .day, value: 1, to: candidate)
    }
}
```

### Step 3: コミット

```bash
jj commit -m "feat(widget): SharedTypes + TimelineProvider 実装

WidgetData の Swift Codable 型と AlarmWidgetTimelineProvider を追加。
App Groups UserDefaults からデータを読み取り、次のアラーム時刻でタイムラインを更新する。"
```

---

## Task 5: Widget Extension — AlarmWidget UI (Small/Medium/Large)

3サイズのウィジェット UI を SwiftUI で実装する。

**Files:**
- Create: `ios/GoodMorningWidgetExtension/AlarmWidget.swift`
- Modify: `ios/GoodMorningWidgetExtension/GoodMorningWidgetBundle.swift`

### Step 1: AlarmWidget.swift — メインウィジェット定義

```swift
// ios/GoodMorningWidgetExtension/AlarmWidget.swift
import SwiftUI
import WidgetKit

@available(iOS 16.0, *)
struct AlarmWidget: Widget {
    let kind: String = "AlarmWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: AlarmWidgetTimelineProvider()) { entry in
            AlarmWidgetEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Good Morning")
        .description("次のアラームと朝ルーティンの進捗")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// MARK: - Entry View (サイズ分岐)

@available(iOS 16.0, *)
struct AlarmWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    var entry: AlarmWidgetEntry

    var body: some View {
        switch family {
        case .systemSmall:
            SmallAlarmView(data: entry.widgetData)
        case .systemMedium:
            MediumAlarmView(data: entry.widgetData)
        case .systemLarge:
            LargeAlarmView(data: entry.widgetData)
        default:
            SmallAlarmView(data: entry.widgetData)
        }
    }
}

// MARK: - Small

@available(iOS 16.0, *)
struct SmallAlarmView: View {
    let data: WidgetData?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // アラーム時刻
            HStack {
                Image(systemName: "sun.max.fill")
                    .foregroundStyle(.orange)
                if let alarm = data?.nextAlarm, alarm.enabled {
                    Text(alarm.time)
                        .font(.title)
                        .fontWeight(.bold)
                } else {
                    Text("OFF")
                        .font(.title)
                        .fontWeight(.bold)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            // ストリーク
            HStack {
                Image(systemName: "flame.fill")
                    .foregroundStyle(.orange)
                Text("\(data?.streak.currentStreak ?? 0)日連続")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            // 曜日
            if let label = data?.nextAlarm?.label {
                Text(label + "曜日")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Medium

@available(iOS 16.0, *)
struct MediumAlarmView: View {
    let data: WidgetData?

    var body: some View {
        HStack(spacing: 16) {
            // 左: アラーム + ストリーク
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: "sun.max.fill")
                        .foregroundStyle(.orange)
                    if let alarm = data?.nextAlarm, alarm.enabled {
                        Text(alarm.time)
                            .font(.title2)
                            .fontWeight(.bold)
                    } else {
                        Text("OFF")
                            .font(.title2)
                            .fontWeight(.bold)
                            .foregroundStyle(.secondary)
                    }
                }
                HStack {
                    Image(systemName: "flame.fill")
                        .foregroundStyle(.orange)
                    Text("\(data?.streak.currentStreak ?? 0)日")
                        .font(.caption)
                }
            }

            Divider()

            // 右: TODO リスト
            VStack(alignment: .leading, spacing: 4) {
                if let session = data?.session {
                    ForEach(session.todos.prefix(5), id: \.id) { todo in
                        HStack(spacing: 4) {
                            Image(systemName: todo.completed ? "checkmark.circle.fill" : "circle")
                                .font(.caption)
                                .foregroundStyle(todo.completed ? .green : .secondary)
                            Text(todo.title)
                                .font(.caption)
                                .strikethrough(todo.completed)
                                .foregroundStyle(todo.completed ? .secondary : .primary)
                        }
                    }
                    Text("\(session.progress.completed)/\(session.progress.total) 完了")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                } else {
                    Text("タスクなし")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: - Large

@available(iOS 16.0, *)
struct LargeAlarmView: View {
    let data: WidgetData?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // ヘッダー
            HStack {
                Image(systemName: "sun.max.fill")
                    .foregroundStyle(.orange)
                if let alarm = data?.nextAlarm, alarm.enabled {
                    Text("次のアラーム: \(alarm.time)")
                        .font(.headline)
                    Spacer()
                    Text(alarm.label + "曜日")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    Text("アラーム OFF")
                        .font(.headline)
                        .foregroundStyle(.secondary)
                }
            }

            // ストリーク
            HStack {
                Image(systemName: "flame.fill")
                    .foregroundStyle(.orange)
                Text("連続 \(data?.streak.currentStreak ?? 0)日 達成")
                    .font(.subheadline)
            }

            Divider()

            // TODO リスト
            if let session = data?.session {
                ForEach(session.todos, id: \.id) { todo in
                    HStack(spacing: 8) {
                        Image(systemName: todo.completed ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(todo.completed ? .green : .secondary)
                        Text(todo.title)
                            .strikethrough(todo.completed)
                            .foregroundStyle(todo.completed ? .secondary : .primary)
                    }
                }

                Divider()

                // プログレスバー
                VStack(alignment: .leading, spacing: 4) {
                    GeometryReader { geometry in
                        let progress = session.progress.total > 0
                            ? Double(session.progress.completed) / Double(session.progress.total)
                            : 0.0
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.secondary.opacity(0.2))
                                .frame(height: 8)
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.green)
                                .frame(width: geometry.size.width * progress, height: 8)
                        }
                    }
                    .frame(height: 8)
                    Text("進捗: \(session.progress.completed)/\(session.progress.total)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                // スヌーズカウントダウン
                if let snoozeStr = session.snoozeFiresAt,
                   let snoozeDate = ISO8601DateFormatter().date(from: snoozeStr),
                   snoozeDate > Date() {
                    HStack {
                        Image(systemName: "bell.badge")
                            .foregroundStyle(.orange)
                        Text("次のスヌーズ: ")
                            .font(.caption)
                        Text(snoozeDate, style: .timer)
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                }
            } else {
                Text("セッション外")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
    }
}
```

### Step 2: GoodMorningWidgetBundle に AlarmWidget を追加

```swift
// ios/GoodMorningWidgetExtension/GoodMorningWidgetBundle.swift
import SwiftUI
import WidgetKit

@available(iOS 16.2, *)
@main
struct GoodMorningWidgetBundle: WidgetBundle {
    var body: some Widget {
        MorningRoutineLiveActivity()
        if #available(iOS 16.0, *) {
            AlarmWidget()
        }
    }
}
```

### Step 3: コミット

```bash
jj commit -m "feat(widget): AlarmWidget UI — Small/Medium/Large 3サイズ対応

Small: アラーム時刻 + ストリーク
Medium: 時刻 + ストリーク + TODO チェックリスト
Large: 時刻 + ストリーク + TODO + プログレスバー + スヌーズカウントダウン

App Groups UserDefaults からデータを読み取り、次のアラーム時刻で自動更新。"
```

---

## Task 6: Background Fetch — タスク登録 + ウィジェット同期

`expo-task-manager` + `expo-background-fetch` を導入し、バックグラウンドでウィジェットデータ同期 + グレード確定を行う。

**Files:**
- Create: `src/services/background-sync.ts`
- Modify: `app/_layout.tsx`
- Modify: `app.config.ts`
- Modify: `package.json` (依存追加)

### Step 1: 依存パッケージをインストール

Run: `pnpm add expo-task-manager expo-background-fetch`

### Step 2: app.config.ts に fetch 背景モードを追加

`UIBackgroundModes` を `['audio']` → `['audio', 'fetch']` に変更:

```typescript
UIBackgroundModes: ['audio', 'fetch'],
```

### Step 3: background-sync.ts — バックグラウンドタスク定義

```typescript
// src/services/background-sync.ts
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { syncWidget } from './widget-sync';

/**
 * バックグラウンドウィジェット同期タスクの識別子。
 * expo-task-manager に登録し、iOS が定期的に実行する。
 */
export const BACKGROUND_WIDGET_SYNC = 'BACKGROUND_WIDGET_SYNC';

/**
 * バックグラウンドタスクを定義する。
 * アプリのトップレベル（import 時）で実行される必要がある。
 * React コンポーネントのライフサイクル外で動作するため、
 * Zustand ストアに直接アクセスしてデータを読み取る。
 */
TaskManager.defineTask(BACKGROUND_WIDGET_SYNC, async () => {
  try {
    // ストアの状態は AsyncStorage から最新を読み込む必要がある。
    // BG 起動時はストアが初期状態のため、先にロードする。
    const { useWakeTargetStore } = await import('../stores/wake-target-store');
    const { useMorningSessionStore } = await import('../stores/morning-session-store');
    const { useDailyGradeStore } = await import('../stores/daily-grade-store');
    const { useSettingsStore } = await import('../stores/settings-store');

    await Promise.all([
      useWakeTargetStore.getState().loadTarget(),
      useMorningSessionStore.getState().loadSession(),
      useDailyGradeStore.getState().loadGrades(),
      useSettingsStore.getState().loadSettings(),
    ]);

    // ウィジェットデータ同期
    await syncWidget();

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * バックグラウンドフェッチタスクを登録する。
 * _layout.tsx の初期化で1回呼ぶ。既に登録済みなら何もしない。
 */
export async function registerBackgroundSync(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_WIDGET_SYNC);
  if (isRegistered) return;

  await BackgroundFetch.registerTaskAsync(BACKGROUND_WIDGET_SYNC, {
    minimumInterval: 30 * 60,  // 30分
    stopOnTerminate: false,
    startOnBoot: true,
  });
}
```

### Step 4: _layout.tsx でバックグラウンドタスク登録 + 初期同期

`app/_layout.tsx` に import 追加:

```typescript
import { registerBackgroundSync } from '../src/services/background-sync';
import { syncWidget } from '../src/services/widget-sync';
```

初期化 useEffect 内（`loadTarget()` 等の後、payload チェックの前あたり）に追加:

```typescript
// バックグラウンドフェッチ登録（fire-and-forget）
registerBackgroundSync().catch(() => {});

// 初回起動時にウィジェットデータを同期
Promise.all([sessionLoaded, loadTarget(), loadRecords(), loadSettings()])
  .then(() => syncWidget())
  .catch(() => {});
```

注意: `loadTarget()` 等の Promise を先に完了させてからでないと `buildWidgetData()` がストアの初期状態を読んでしまう。初期化フローの修正が必要な場合は、既存の `loadTarget()` 等の呼び出しを Promise 変数に保存して `Promise.all().then(() => syncWidget())` にする。

### Step 5: テスト実行 + 型チェック

Run: `pnpm test && pnpm typecheck`
Expected: 全テスト PASS、型エラーなし

### Step 6: コミット

```bash
jj commit -m "feat: Background Fetch によるウィジェット定期同期

expo-task-manager + expo-background-fetch を導入。
BACKGROUND_WIDGET_SYNC タスクが30分間隔でストアを再読み込みし、
App Groups UserDefaults を更新してウィジェットタイムラインをリロードする。
_layout.tsx の初期化時にタスク登録 + 初回同期を実行。"
```

---

## Task 7: 結合テスト + lint/format 修正

全体の結合確認と品質チェック。

**Files:**
- 全ファイル

### Step 1: 全テスト実行

Run: `pnpm test`
Expected: 全テスト PASS

### Step 2: 型チェック

Run: `pnpm typecheck`
Expected: エラーなし

### Step 3: lint + format

Run: `pnpm lint:fix && pnpm format`
Expected: 自動修正後にクリーン

### Step 4: lint 確認

Run: `pnpm lint`
Expected: エラーなし

### Step 5: コミット（修正があれば）

```bash
jj commit -m "chore: lint/format 修正"
```

---

## Task 8: user-flows.md 更新

ウィジェットと Background Fetch のユーザーフローをドキュメントに追加する。

**Files:**
- Modify: `docs/user-flows.md`

### Step 1: 以下のセクションを追加

#### 13. ホームウィジェット表示フロー

```
ホーム画面にウィジェットを追加
  └─ AlarmWidget (Small/Medium/Large)
       └─ TimelineProvider が App Groups UserDefaults を読み取り
            ├─ nextAlarm: 次のアラーム時刻
            ├─ session: アクティブな TODO 進捗
            ├─ streak: 連続達成日数
            └─ updatedAt: 最終更新時刻
       └─ タイムライン更新トリガー:
            ├─ メインアプリでストア変更 → syncWidget() → reloadWidgetTimelines()
            ├─ Background Fetch → syncWidget() → reloadWidgetTimelines()
            └─ 次のアラーム時刻（Timeline policy: .after(nextAlarmDate)）
       └─ タップ → アプリを起動
```

#### 14. バックグラウンド同期フロー

```
iOS がバックグラウンドフェッチを実行（30分〜数時間間隔）
  └─ BACKGROUND_WIDGET_SYNC タスク
       ├─ 全ストアを AsyncStorage からロード
       ├─ buildWidgetData() で最新データを組み立て
       ├─ syncWidgetData() で App Groups UserDefaults に書き出し
       └─ reloadWidgetTimelines() でウィジェット更新
```

### Step 2: コミット

```bash
jj commit -m "docs: ウィジェット表示 + バックグラウンド同期フローを追加"
```

---

## 実装順序の依存関係

```
Task 1 (型 + ブリッジ)
  ├─→ Task 2 (ストア自動同期)
  ├─→ Task 3 (ネイティブ実装)
  │     └─→ Task 4 (Swift SharedTypes + Provider)
  │           └─→ Task 5 (Widget UI)
  └─→ Task 6 (Background Fetch)
        └─→ Task 7 (結合テスト)
              └─→ Task 8 (ドキュメント)
```

Task 2, 3, 6 は Task 1 完了後に並行可能。
Task 4 は Task 3 の後（ネイティブ API が動く前提）。
Task 5 は Task 4 の後。
Task 7, 8 は最後。
