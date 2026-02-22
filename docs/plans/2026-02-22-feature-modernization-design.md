# Feature Modernization Design

Date: 2026-02-22

## Overview

Good Morning アプリに3つの機能を追加する: i18n（多言語対応）、HealthKit 睡眠データ連携、起床 PDCA 可視化。

## 1. i18n（多言語対応）

### Library

- `i18next` + `react-i18next` + `expo-localization`
- 選定理由: エコシステム最大、TypeScript 型安全キー対応、Expo 推奨

### Structure

```
src/i18n/
  index.ts              # i18next 初期化 + expo-localization でデバイス言語検出
  i18next.d.ts          # 型定義 (翻訳キーの型安全)
  locales/
    ja/
      common.json       # 共通 (保存, キャンセル, 曜日等)
      alarm.json        # アラーム画面系
      wakeup.json       # 起床フロー系
      stats.json        # 統計画面系
    en/
      common.json
      alarm.json
      wakeup.json
      stats.json
```

### Language Detection

- `expo-localization` の `getLocales()` でデバイス言語を取得
- サポート言語: ja, en（デフォルト: ja）
- 非サポート言語は ja にフォールバック

### Type Safety

`src/i18n/i18next.d.ts` で `CustomTypeOptions` を定義し、翻訳キーの型チェックを有効化。存在しないキーを使うと TypeScript エラーになる。

### Lint Enforcement

Biome v2.4 の `noJsxLiterals` ルールで JSX 内ハードコード文字列をエラーにする。

```json
"style": {
  "noJsxLiterals": "error"
}
```

### Target Strings

約30個のハードコード文字列:
- 画面テキスト (タイトル、ラベル、ボタン、ステータスメッセージ)
- プレースホルダー
- 通知メッセージ ("Good Morning!", "Time to wake up!")
- 曜日ラベル (Sun, Mon, ...)
- 繰り返しパターン (Once, Every day, Weekdays, Weekends)
- アラートダイアログ (確認メッセージ)

## 2. HealthKit Sleep Data Integration

### Library

- `react-native-health`
- 選定理由: Expo Config Plugin 公式ドキュメントあり、`getSleepSamples()` が専用メソッド

### Constraints

- Development Build 必須 (Expo Go では動作しない)
- 読み取り専用
- Apple Watch ユーザーが主対象
- 権限拒否を検出できない (Apple プライバシーポリシー)

### Data Available

| Value | Meaning | Source |
|---|---|---|
| `INBED` startDate | 就寝時刻 | iPhone/Watch |
| `INBED` endDate | 起床時刻 | iPhone/Watch |
| `CORE/DEEP/REM` | 睡眠ステージ | Watch only |

### Service Design

```
src/services/health.ts
```

- `initHealthKit()` — 権限リクエスト
- `getSleepSummary(date: Date)` — 指定日の就寝/起床/睡眠時間
- データなしの場合は `null` を返す

### Config Plugin

```json
[
  "react-native-health",
  {
    "healthSharePermission": "Good Morning はあなたの睡眠データを読み取り、起床パターンを分析します"
  }
]
```

### Privacy Handling

ユーザーが権限拒否した場合、データが空で返る。UI では「ヘルスケアデータが見つかりません」と表示。

## 3. Wake-up PDCA Visualization

### Core Concept

「朝起きれたか？」を一目で把握し、改善サイクルを回せる仕組み。

### New Tab

```
[ Alarms ] [ Stats ] [ Settings ]
```

### Data Model: WakeRecord

```typescript
interface WakeRecord {
  readonly id: string;
  readonly alarmId: string;
  readonly date: string; // YYYY-MM-DD

  readonly targetTime: AlarmTime;
  readonly alarmTriggeredAt: string; // ISO datetime
  readonly dismissedAt: string; // ISO datetime
  readonly healthKitWakeTime: string | null; // ISO datetime

  readonly result: WakeResult; // 'great' | 'ok' | 'late' | 'missed'
  readonly diffMinutes: number; // positive = late, negative = early

  readonly todos: readonly WakeTodoRecord[];
  readonly todoCompletionSeconds: number;
  readonly alarmLabel: string;
}

interface WakeTodoRecord {
  readonly id: string;
  readonly title: string;
  readonly completedAt: string | null;
  readonly orderCompleted: number | null;
}
```

### Wake Result Criteria

| Result | Condition | Color |
|---|---|---|
| Great | within ±5min of target | success (#2ed573) |
| OK | 5-15min after target | warning (#ffa502) |
| Late | >15min after target | primary (#e94560) |
| Missed | alarm not dismissed | textMuted (#6b6b80) |

### Stats Screen (MVP)

1. **Summary Cards** — 今週の成功率、平均起床時間、目標との差分
2. **Weekly Calendar** — 月〜日のドット色で一目把握、スワイプで週切替
3. **Streak Display** — 連続成功日数 + 最長記録

### Store

```typescript
// src/stores/wake-record-store.ts
interface WakeRecordState {
  readonly records: readonly WakeRecord[];
  readonly loaded: boolean;
  loadRecords: () => Promise<void>;
  addRecord: (record: Omit<WakeRecord, 'id'>) => Promise<void>;
  getRecordsForPeriod: (start: Date, end: Date) => readonly WakeRecord[];
  getWeekStats: (weekStart: Date) => WakeStats;
  getCurrentStreak: () => number;
}
```

AsyncStorage に JSON で保存。統計は records から都度計算。

### Record Timing

wakeup 画面の Dismiss ボタン押下時に自動記録。

## 4. Phased Rollout

| Phase | Content |
|---|---|
| Phase 1 | i18n 基盤 + lint ルール + 全既存画面の多言語化 |
| Phase 2 | 起床記録データモデル + Stats タブ MVP |
| Phase 3 | HealthKit 連携 + 睡眠データ紐づけ + 目標vs実績グラフ |
| Phase 4 | Todo 効果分析、前週比、月間ビュー |

## 5. New Dependencies

| Package | Purpose | Phase |
|---|---|---|
| `i18next` | i18n core | 1 |
| `react-i18next` | React hooks for i18n | 1 |
| `expo-localization` | Device language detection | 1 |
| `react-native-health` | HealthKit access | 3 |
