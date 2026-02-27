# Daily Grade & Streak System 設計

> 日付: 2026-02-27
> ステータス: 承認済み

## 概要

HealthKit の睡眠データとアラーム解除行動を組み合わせて、1日を ◎○△× の4段階で評価する仕組み。
連続達成でストリークを形成し、ストリークフリーズで1日の失敗を救済できる。

## 背景・目的

- 現在の `WakeResult` (`great`/`ok`/`late`/`missed`) はアラーム解除のタイミングのみを評価
- 「良い睡眠習慣」は朝の起床だけでなく、夜の就寝タイミングも重要
- 朝 × 夜 の2軸評価 + ストリーク + フリーズで、継続的なモチベーションを維持する

---

## Section 1: グレードシステム

### 1.1 4段階グレード

| グレード | 表示 | 条件 |
|---|---|---|
| `excellent` | ◎ | 朝 ○ かつ 夜 ○ |
| `good` | ○ | 朝 ○ かつ 夜 ×/noData |
| `fair` | △ | 朝 × かつ 夜 ○ |
| `poor` | × | 朝 × かつ 夜 ×/noData |

### 1.2 朝の判定

既存の `WakeResult` をそのまま使用:
- `great` / `ok` → 朝 ○
- `late` / `missed` → 朝 ×

### 1.3 夜の判定

HealthKit の就寝データ + ユーザー設定の目標就寝時刻:
- 目標 ± 30分以内 → `onTime` (夜 ○)
- 目標 ± 30分超 → `late` (夜 ×)
- データなし → `noData` (夜 ×扱い)

### 1.4 HealthKit 未連携時

夜の判定が常に `noData` になるため、最大 ○ まで。◎ を取るには HealthKit 連携 + 目標就寝時刻の設定が必要。

---

## Section 2: ストリーク & ストリークフリーズ

### 2.1 ストリーク（連続達成）

- ◎ または ○ の日が連続するとストリーク +1
- △ はストリーク維持（増えないが途切れない）
- × でストリーク途切れ（フリーズで救済可能）

### 2.2 ストリークフリーズ

- ◎ を取ると翌日にフリーズが 1 個貯まる（最大2個）
- × が付いた日にフリーズを自動消費してストリーク維持
- フリーズ 0 個 + × → ストリーク 0 にリセット

### 2.3 グレード別のストリーク影響

```
DailyGradeRecord 確定
  ├─ ◎ excellent → streak += 1, freezes = min(freezes + 1, 2)
  ├─ ○ good      → streak += 1
  ├─ △ fair      → streak 維持（増えない、減らない）
  └─ × poor      → freezes > 0 ? freezes -= 1 : streak = 0
```

### 2.4 フリーズのUI表示

- 🧊 アイコン × 個数（0〜2）
- フリーズ消費時: トースト通知「🧊 ストリークフリーズを使用しました」
- ◎ 獲得でフリーズ獲得時: 「🧊 ストリークフリーズ獲得！(1/2)」

---

## Section 3: データモデル

### 3.1 新しい型定義

```ts
// src/types/daily-grade.ts

/** 1日の総合グレード。朝・夜の2軸から算出される。 */
export type DailyGrade = 'excellent' | 'good' | 'fair' | 'poor';

/** 夜の評価（就寝時刻が目標範囲内か） */
export type BedtimeResult = 'onTime' | 'late' | 'noData';

export interface DailyGradeRecord {
  readonly date: string;                  // YYYY-MM-DD
  readonly grade: DailyGrade;
  readonly morningPass: boolean;          // WakeResult が great/ok
  readonly bedtimeResult: BedtimeResult;
  readonly bedtimeTarget: string | null;  // HH:mm — 就寝目標
  readonly actualBedtime: string | null;  // ISO datetime
}
```

### 3.2 ストリーク状態

```ts
// src/types/streak.ts

export interface StreakState {
  readonly currentStreak: number;
  readonly longestStreak: number;
  readonly freezesAvailable: number;       // 0〜2
  readonly freezesUsedTotal: number;       // 統計用
  readonly lastGradedDate: string | null;  // YYYY-MM-DD
}

export const MAX_FREEZES = 2;
```

### 3.3 既存コードへの影響

| 既存 | 変更 |
|---|---|
| `WakeResult` (`great`/`ok`/`late`/`missed`) | **変更なし** — 朝の評価としてそのまま使う |
| `WakeRecord` | フィールド追加なし — `DailyGradeRecord` を別テーブルで管理 |
| `WakeStats.currentStreak` | **非推奨化** → `StreakState.currentStreak` に移行 |
| `getCurrentStreak()` | 新しいストリーク計算ロジックに置き換え |
| `useDailySummary` | `DailyGradeRecord` の自動生成ロジックを追加 |

### 3.4 WakeRecord と分離する理由

- `WakeRecord` はアラーム解除時に **即座に** 作成される
- `DailyGradeRecord` は **夜の就寝データが揃ってから** 確定する（翌日に判定）
- ライフサイクルが異なるため、別エンティティにする方が整合性を保てる

### 3.5 永続化

- `DailyGradeRecord[]` → AsyncStorage `daily-grades` キー
- `StreakState` → AsyncStorage `streak-state` キー
- フリーズの増減はストア内のアクションで一元管理

---

## Section 4: グレード算出ロジック

### 4.1 朝の判定

```ts
function isMorningPass(result: WakeResult): boolean {
  return result === 'great' || result === 'ok';
}
```

### 4.2 夜の判定

```ts
/**
 * 就寝目標 ± 30分以内なら onTime。
 * 例: 目標 23:00 → 22:30〜23:30 に就寝すれば onTime。
 */
function evaluateBedtime(
  actualBedtime: Date | null,
  targetBedtime: AlarmTime,
): BedtimeResult {
  if (actualBedtime === null) return 'noData';

  const targetMinutes = targetBedtime.hour * 60 + targetBedtime.minute;
  const actualMinutes = actualBedtime.getHours() * 60 + actualBedtime.getMinutes();
  const diff = Math.abs(actualMinutes - targetMinutes);

  return diff <= 30 ? 'onTime' : 'late';
}
```

### 4.3 就寝目標の設定

- `WakeTarget` に `bedtimeTarget: AlarmTime | null` を追加
- デフォルト: `null`（未設定 → 夜の判定は常に `noData`）
- 設定画面で「目標就寝時刻」として設定
- 未設定なら最大 ○ まで。◎ を目指すなら設定を促す

### 4.4 グレード確定タイミング

```
時系列:
  2/27 07:00  アラーム解除 → WakeRecord 作成（朝の判定は確定）
  2/27 23:00  就寝（HealthKit に記録）
  2/28 07:00  アプリ起動 → useDailySummary(2/27) で睡眠データ取得
             → 2/27 の DailyGradeRecord 確定
             → ストリーク/フリーズ更新
```

- **グレード確定 = 翌朝のアプリ起動時**
- `useDailySummary` 内で「前日のグレードが未確定なら確定する」ロジックを追加
- 2日以上開かなかった場合 → 間の日は `WakeRecord` なし = 朝× → `noData` × なので `poor`

---

## Section 5: UI 変更

### 5.1 ダッシュボード変更

```
┌─────────────────────────────────────┐
│  🔥 12日連続   🧊×2                │  ← ストリーク + フリーズ
├─────────────────────────────────────┤
│  月   火   水   木   金   土   日   │
│  ◎   ○   △   ◎   ○           │  ← グレードアイコン
│                      ↑今日          │
├─────────────────────────────────────┤
│  昨晩の睡眠  ████████░░  7h12m     │  ← 既存の SleepCard
└─────────────────────────────────────┘
```

- 週間カレンダーのドット → グレードアイコン（◎○△×）に置換
- カレンダー上部にストリーク表示を追加
- フリーズ個数を氷アイコンで表示

### 5.2 グレードアイコンの色

| グレード | アイコン | 色 |
|---|---|---|
| ◎ excellent | ◎ | `colors.primary`（アプリのテーマカラー） |
| ○ good | ○ | `#4CAF50`（緑） |
| △ fair | △ | `#FF9800`（オレンジ） |
| × poor | × | `#F44336`（赤） |
| 未確定 | ・ | `#9E9E9E`（グレー） |

### 5.3 日別レビュー画面

SleepDetailSection の下に追加:

```
┌─────────────────────────────────────┐
│  2/27（木）                          │
│                                      │
│  [タイムラインバー]                   │  ← 既存
│  就寝 23:15  起床 6:52  睡眠 7h37m   │  ← 既存
│                                      │
│  ─── 本日のグレード ───              │  ← 新規
│         ◎                            │
│  朝 ○ 目標 7:00 → 解除 6:52 (-8分)  │
│  夜 ○ 目標 23:00 → 就寝 23:15       │
│                                      │
│  🔥 12日連続   🧊×2                │
└─────────────────────────────────────┘
```

### 5.4 設定画面

既存の設定画面に追加:

```
  [目標就寝時刻]  23:00  >     ← 新規（TimePicker）
```

- `WakeTarget` の `bedtimeTarget` を編集
- 未設定時: 「設定すると ◎ を狙えるようになります」

### 5.5 新規コンポーネント

| コンポーネント | 内容 |
|---|---|
| `GradeIcon` | ◎○△× を色付きで表示（size prop） |
| `StreakBadge` | 🔥 N日連続 + 🧊×N をコンパクトに表示 |
| `DailyGradeSection` | 日別レビュー用のグレード詳細セクション |

### 5.6 既存コンポーネントの変更

| コンポーネント | 変更 |
|---|---|
| `WeeklyCalendar` | ドット → `GradeIcon` に置換 |
| ダッシュボード画面 | `StreakBadge` をカレンダー上部に追加 |
| 設定画面 | 「目標就寝時刻」セクション追加 |
