# ホームウィジェット + Background Fetch 設計書

## 背景

Good Morning アプリは Live Activity でロック画面にセッション進捗を表示しているが、ホーム画面ウィジェットは未実装。
また、ウィジェットデータの更新はフォアグラウンド操作に完全依存しており、アプリを長時間開かないとデータが古くなる。

**ゴール:**
1. ホームウィジェット（Small/Medium/Large）を追加し、次のアラーム時刻・TODO 進捗・ストリーク情報を表示
2. Background Fetch でウィジェットデータを定期同期し、グレード確定もバックグラウンドで実行
3. 既存の Live Activity は変更なし（インタラクティブ化は次フェーズ）

## アプローチ

**A + B ハイブリッド:**
- **A. App Groups UserDefaults**: メインアプリが状態変更時にデータを書き込み、Widget Extension が読み取る
- **B. Background Fetch**: `expo-background-fetch` で定期的にデータを再同期 + グレード確定

Push Notification (アプローチ C) はサーバーレス設計のため不採用。

## データ共有レイヤー

### SharedDataStore（App Groups UserDefaults）

メインアプリと Widget Extension が共有するデータモデル。
App Groups UserDefaults の key `"widget-data"` に JSON として保存する。

```typescript
interface WidgetData {
  nextAlarm: {
    time: string;      // "HH:mm" 形式
    enabled: boolean;
    label: string;     // 曜日ラベル（例: "月"）
  } | null;
  session: {
    todos: Array<{ id: string; title: string; completed: boolean }>;
    snoozeFiresAt: string | null;  // ISO 8601
    progress: { completed: number; total: number };
  } | null;
  streak: {
    currentStreak: number;
    lastGrade: string;  // "excellent" | "good" | "fair" | "poor"
  };
  updatedAt: string;  // ISO 8601, 鮮度チェック用
}
```

### 書き込みタイミング（メインアプリ側）

| トリガー | 更新されるフィールド |
|---------|---------------------|
| `setTarget()` / `toggleEnabled()` | `nextAlarm` |
| `startSession()` / `toggleTodo()` / `clearSession()` | `session` |
| `addGrade()` | `streak` |
| background fetch 実行 | 全フィールド再同期 |

書き込み後は必ず `WidgetCenter.shared.reloadAllTimelines()` を呼び出してウィジェットを更新する。

### JS → Native ブリッジ

expo-alarm-kit に2つのメソッドを追加:

```typescript
// App Groups UserDefaults にデータを書き込む
export async function syncWidgetData(data: WidgetData): Promise<void>;

// WidgetCenter.shared.reloadAllTimelines() を呼ぶ
export async function reloadWidgetTimelines(): Promise<void>;
```

## ホームウィジェット UI

### サイズごとの情報設計

**Small:**
- セッション中: 次のアラーム時刻 + ストリーク日数
- セッション外: 同上
- アラーム無効: 「アラーム OFF」+ ストリーク

**Medium:**
- セッション中: 時刻 + ストリーク + TODO チェックリスト（完了/未完了マーク付き）+ 進捗
- セッション外: 時刻 + ストリーク + タスクプレビュー（bullet list）

**Large:**
- セッション中: 時刻 + ストリーク + TODO チェックリスト + プログレスバー + スヌーズカウントダウン
- セッション外: 時刻 + ストリーク + タスクプレビュー + 週間カレンダーミニ（将来）

### タップアクション

ウィジェットタップでアプリを起動する。Deep Link は初期実装では不使用（アプリのルート画面に遷移）。

### Timeline 戦略

`TimelineProvider` は以下のタイムラインを生成:
- **現在のエントリ**: UserDefaults から読んだ最新データ
- **次のアラーム時刻のエントリ**: アラーム時刻に自動更新（アラーム後のセッション開始を想定）
- **リロードポリシー**: `.after(nextAlarmDate)` — 次のアラーム時刻にタイムライン再取得

## Background Fetch 統合

### タスク定義

```typescript
const BACKGROUND_WIDGET_SYNC = 'BACKGROUND_WIDGET_SYNC';

TaskManager.defineTask(BACKGROUND_WIDGET_SYNC, async () => {
  // 1. AsyncStorage からストア状態を読み込み
  // 2. 未確定グレードがあれば確定（HealthKit は使わない — BG での取得制限のため）
  // 3. WidgetData を組み立てて syncWidgetData() で UserDefaults に書き出し
  // 4. reloadWidgetTimelines() でウィジェット更新
  return BackgroundFetch.BackgroundFetchResult.NewData;
});
```

### 実行内容

1. **Widget データ同期**: 現在のアラーム時刻・ストリーク・セッション状態を App Groups に書き出し
2. **グレード確定**: ダッシュボードを開かなくても未確定日のグレードを処理（HealthKit 就寝データは除外 — BG 制限のため `nightPass` は `null`）
3. **Widget タイムライン更新**: `WidgetCenter.shared.reloadAllTimelines()`

### 制約

- iOS が実行タイミングを制御（最短約30分間隔、保証なし）
- 実行時間は最大30秒
- HealthKit のバックグラウンドアクセスは `HKObserverQuery` が必要（今回スコープ外）
- グレード確定時の `nightPass` は BG では取得できないため、フォアグラウンド復帰時に再評価する

### 登録

`app/_layout.tsx` の初期化で登録:

```typescript
BackgroundFetch.registerTaskAsync(BACKGROUND_WIDGET_SYNC, {
  minimumInterval: 30 * 60,  // 30分
  stopOnTerminate: false,
  startOnBoot: true,
});
```

## 変更対象ファイル

### 新規作成

| ファイル | 内容 |
|---------|------|
| `src/services/widget-sync.ts` | `syncWidgetData()` — ストアの状態を App Groups に書き出す JS ラッパー |
| `src/services/background-sync.ts` | background fetch タスクの定義・登録 |
| `ios/.../SharedTypes.swift` | `WidgetData` の Codable struct 定義 |
| `ios/.../AlarmWidget.swift` | Small/Medium/Large ホームウィジェット UI |
| `ios/.../AlarmWidgetTimelineProvider.swift` | Timeline 生成ロジック |

### 変更

| ファイル | 変更内容 |
|---------|---------|
| `src/stores/wake-target-store.ts` | target 変更時に `syncWidgetData()` 呼び出し追加 |
| `src/stores/morning-session-store.ts` | session 変更時に `syncWidgetData()` 呼び出し追加 |
| `src/stores/daily-grade-store.ts` | grade 追加時に `syncWidgetData()` 呼び出し追加 |
| `app/_layout.tsx` | background fetch タスク登録 + 初期同期 |
| `app.config.ts` | `UIBackgroundModes` に `'fetch'` 追加 |
| `ios/.../GoodMorningWidgetBundle.swift` | `AlarmWidget` をバンドルに追加 |
| expo-alarm-kit native module | `syncWidgetData()` / `reloadWidgetTimelines()` メソッド追加 |

## スコープ外（次フェーズ）

- Live Activity のインタラクティブ化（ロック画面から TODO トグル）
- HealthKit のバックグラウンド同期（`HKObserverQuery`）
- Push Notification 経由のリモートウィジェット更新
- ウィジェットからの Deep Link
