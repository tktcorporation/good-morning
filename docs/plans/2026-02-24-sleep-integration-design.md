# HealthKit 睡眠データ統合表示

## 概要

HealthKit の睡眠データ（readonly、オンデマンド取得）をアプリのアラーム解除ログ（WakeRecord）と統合し、グラフィカルなタイムラインバーで日次ステータスを表示する。

## 方針

- HealthKit データは**永続化しない**（表示時にオンデマンド取得）
- `react-native-svg` を使ったタイムラインバーで視覚化
- ダッシュボード（簡易）と日別レビュー（詳細）の両方に表示

## コンポーネント設計

### SleepTimelineBar

SVG によるタイムラインバー。横軸 20:00〜12:00（16h幅）固定。

```ts
interface SleepTimelineBarProps {
  bedtime: Date | null;
  wakeTime: Date | null;
  targetTime: AlarmTime | null;
  dismissedAt: Date | null;
  compact?: boolean; // true=ダッシュボード用(60px), false=レビュー用(100px)
}
```

描画要素:
- 睡眠範囲: 丸角 Rect、colors.primary（半透明）
- 目標時刻: 点線の縦ライン
- 解除時刻: 実線の縦ライン
- 時刻ラベル: 下部に2時間刻み

### SleepCard（ダッシュボード用）

週間カレンダーの下に配置。compact タイムラインバー + 就寝/起床/睡眠時間のサマリー。
HealthKit 未連携時は「ヘルスケアと連携」ボタンを表示。

### SleepDetailSection（日別レビュー用）

通常サイズのタイムラインバー + 就寝時刻/起床時刻/睡眠時間の数値行。
HealthKit データなし時は「データなし」表示。

## データフロー

```
HealthKit (readonly)          WakeRecord (アプリ内)
    │                              │
    ▼                              ▼
getSleepSummary(date)         record.dismissedAt
    │                         record.targetTime
    ▼                              │
┌─────────────────────────────────────┐
│  useDailySummary(date) カスタムhook  │
│  → SleepSummary | null              │
│  → WakeRecord | undefined           │
└─────────────────────────────────────┘
    │
    ▼
  SleepTimelineBar コンポーネント
```

### useDailySummary hook

```ts
interface DailySummary {
  date: string;
  sleep: SleepSummary | null;
  record: WakeRecord | undefined;
  loading: boolean;
}
function useDailySummary(date: Date): DailySummary
```

## HealthKit 初期化

- 設定画面に「ヘルスケア連携」トグルを追加
- ダッシュボードの睡眠カードで未連携時に「連携する」ボタン
- `useSettingsStore` に `healthKitEnabled: boolean` を追加して永続化

## 新規ファイル

| ファイル | 内容 |
|---|---|
| `src/components/sleep/SleepTimelineBar.tsx` | SVGタイムラインバー |
| `src/components/sleep/SleepCard.tsx` | ダッシュボード用睡眠カード |
| `src/components/sleep/SleepDetailSection.tsx` | 日別レビュー用睡眠セクション |
| `src/hooks/useDailySummary.ts` | HealthKit + WakeRecord 統合hook |

## 依存追加

| パッケージ | 理由 |
|---|---|
| `react-native-svg` | タイムラインバー描画 |

## i18n キー追加

`stats.json` の `healthKit` セクションに追加:
- `sleep.title`: 睡眠データ
- `sleep.bedtime`: 就寝時刻
- `sleep.wakeTime`: 起床時刻
- `sleep.duration`: 睡眠時間
- `sleep.lastNight`: 昨晩の睡眠
- `sleep.noData`: データなし
- `sleep.connect`: ヘルスケアと連携
