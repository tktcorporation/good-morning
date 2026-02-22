# DRY Improvements Design

## Overview

プロジェクト全体のDRY (Don't Repeat Yourself) 違反を解消し、設定値の一元管理とコードの重複排除を行う。

## Section 1: 設定値の一元管理

### 1.1 Node.jsバージョン — CI env で一元定義

CI workflow の各ジョブで `node-version: 22` が5箇所ハードコードされている。
workflow レベルの `env` で `NODE_VERSION` を定義し、各ジョブから `${{ env.NODE_VERSION }}` で参照する。
EAS build workflow も同様に対応。

### 1.2 app.json → app.config.ts 変換

`package.json` と `app.json` でバージョン (`1.0.0`) が重複定義されている。
`app.json` を `app.config.ts` に変換し、`package.json` の version を動的に読み込む。

### 1.3 CLAUDE.md の設定値参照化

biome.json / tsconfig.json の設定値が CLAUDE.md に転記されている。
「ファイル参照」形式に変更し、設定値の重複を排除する。

## Section 2: 共有定数・ユーティリティの統合

### 2.1 RESULT_COLORS 統合

3ファイル (WeeklyCalendar, index, day-review) で定義されており、値の矛盾がある。
`src/constants/theme.ts` に統一定義。`ok: colors.success` が正。

透過色 (`rgba(46, 213, 115, 0.15)` 等) も `semanticColors` として theme.ts に追加。

### 2.2 日付ユーティリティ集約

`src/utils/date.ts` を新規作成し以下を集約:
- `formatIsoTime(isoString)` — ISO文字列からHH:MM形式
- `getWeekDates()` — 今週の月曜〜日曜のDate配列
- `formatDateString(date)` — 既存の wake-record.ts から移動

### 2.3 getRecordsForPeriod の活用

`index.tsx` の手動フィルタをストアの既存メソッド `getRecordsForPeriod` に置き換え。

### 2.4 曜日ラベル統一

`index.tsx` のハードコード `DAY_NAMES` を削除し、既存の `getDayLabel(day, t)` を使用。

## Section 3: 共有コンポーネント化

### 3.1 StepButton コンポーネント

Onboarding 5ファイルで重複するボタンスタイルを `src/components/onboarding/StepButton.tsx` に集約。
`variant: 'primary' | 'secondary'` で分岐。

### 3.2 StepHeader コンポーネント

Onboarding 5ファイルのヘッダーパターンを `src/components/onboarding/StepHeader.tsx` に集約。
`title` と `subtitle` を props で受け取る。

### 3.3 共通スタイルパターン

カード/サーフェス、セクション、セクションタイトルの共通スタイルを `theme.ts` に `commonStyles` として追加。
