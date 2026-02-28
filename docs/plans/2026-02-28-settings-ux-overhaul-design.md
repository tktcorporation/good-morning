# 設定UXオーバーホール — 日付変更ライン & 目標睡眠時間

## 背景

日付変更ラインがスライダーUI（0-6時、PanResponder）で操作性が悪い。
目標就寝時間が設定画面に孤立しており、アラーム時刻との関連が直感的でない。
iOSヘルスケアの体験に寄せ、「目標睡眠時間 + アラーム時刻 → 目標就寝時刻」の自動算出に変更する。

## 変更1: 日付変更ライン

### Before
- `DayBoundarySlider`: PanResponder + 7段階スナップ（0-6時）

### After
- `DayBoundaryPicker`: ドラムロール式ピッカー（0-23時、1時間刻み）
- 設定画面の行タップ → ボトムシート → ピッカー → 確認/キャンセル
- 範囲: 0:00〜23:00（24項目）

### ストア
- `dayBoundaryHour` の範囲を 0-6 → 0-23 に拡張
- 既存値（0-6）はそのまま有効、マイグレーション不要

### データ整合性
- `WakeRecord.date` は変更しない（記録時点のまま保持）
- `getLogicalDateString()` は現在の `dayBoundaryHour` を使う
- 統計は `alarmTriggeredAt`（ISO datetime）から再計算可能
- 変更時に「過去の統計の日付区分が変わる可能性があります」とアラート表示

### テストケース
1. 海外渡航: boundary 0→12 変更で既存レコード消失なし
2. 生活習慣変更: 夜勤→日勤切替で新規レコード正常記録
3. 境界値: 23時設定で 22:59=前日、23:00=当日

## 変更2: 目標睡眠時間

### Before
- `bedtimeTarget: AlarmTime | null` — 設定画面で直接就寝時刻を指定
- `BedtimePickerModal`: ボトムシート + 上下ボタン式（20:00〜02:00）

### After
- `targetSleepMinutes: number | null` — 目標睡眠時間（分）
- 選択肢: 5:00〜10:00、30分刻み（300, 330, 360 ... 600）
- 目標就寝時刻 = アラーム時刻 - targetSleepMinutes（自動算出）

### メイン画面UI
```
┌─────────────────────────┐
│  明日 6:00              │  ← 既存アラーム時刻
│                         │
│  💤 7h睡眠 → 23:00就寝  │  ← 新規: タップで変更可能
└─────────────────────────┘
```
- タップ → ボトムシート → 睡眠時間ピッカー
- 未設定時: 「目標睡眠時間を設定」リンク

### 設定画面
- `BedtimePickerModal` 削除
- 目標就寝時間の設定行を削除

### マイグレーション
- 既存 `bedtimeTarget` → `defaultTime` との差分で `targetSleepMinutes` 算出
- `bedtimeTarget` フィールドは削除

### Daily Grade
- `DailyGradeRecord.bedtimeTarget` は `HH:mm` 文字列で保存（算出値）
- `evaluateBedtime()` ロジック変更なし（比較形式同一）

## 削除するファイル/コンポーネント
- `src/components/DayBoundarySlider.tsx`
- `src/components/BedtimePickerModal.tsx`

## 新規作成
- `src/components/DayBoundaryPicker.tsx`
- `src/components/SleepDurationCard.tsx`（メイン画面用）
- `src/components/SleepDurationPickerModal.tsx`
