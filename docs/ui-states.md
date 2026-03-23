# UI 状態カタログ

> **このファイルは自動生成されています。** 直接編集しないでください。
> ソース: `src/docs/screen-states.ts` → `pnpm generate:ui-docs` で再生成

全 7 画面・25 状態 | スクリーンショット: 0/25 撮影済み

---

## 画面一覧

| # | 画面 | ルート | 種別 | 状態数 |
|---|------|--------|------|--------|
| 1 | ダッシュボード | `/(tabs)/index` | タブ | 6 |
| 2 | 設定 | `/(tabs)/settings` | タブ | 3 |
| 3 | オンボーディング | `/onboarding` | スタック | 6 |
| 4 | 時刻変更 | `/target-edit` | モーダル | 2 |
| 5 | スケジュール | `/schedule` | モーダル | 3 |
| 6 | 日次レビュー | `/day-review` | モーダル | 3 |
| 7 | タブバー（共通） | `/(tabs)/_layout` | レイアウト | 2 |

---

## 1. ダッシュボード (`app/(tabs)/index.tsx`)

メインハブ。アラーム時刻、TODO進捗、週間統計を表示する。

### 状態一覧

| 状態 | 条件 | スクリーンショット |
|------|------|-------------------|
| Loading | `loaded === false` | `dashboard--loading.png` |
| Idle（TODOあり） | `session === null && target.todos.length > 0` | `dashboard--idle-with-todos.png` |
| Idle（TODOなし） | `session === null && target.todos.length === 0` | `dashboard--idle-no-todos.png` |
| Session Active（ゴール内） | `session !== null && !goalExceeded` | `dashboard--session-active.png` |
| Session Active（ゴール超過） | `session !== null && goalExceeded` | `dashboard--session-exceeded.png` |
| AlarmKit エラー | `!isAlarmKitAvailable()` | `dashboard--alarmkit-error.png` |

#### Loading

- **条件**: `loaded === false`
- **スクリーンショット**: `dashboard--loading.png` (未撮影)

```
┌─────────────────────────┐
│                         │
│       Loading...        │
│                         │
└─────────────────────────┘
```

> **UX メモ**: スピナーなし、テキストのみ。初回起動で数秒かかる場合にユーザーが不安に感じる可能性

#### Idle（TODOあり）

- **条件**: `session === null && target.todos.length > 0`
- **スクリーンショット**: `dashboard--idle-with-todos.png` (未撮影)

```
┌─────────────────────────┐
│     明日, 月曜日          │
│       07:00              │
├─────────────────────────┤
│  睡眠時間カード            │
├─────────────────────────┤
│  起床目標バッファ          │
│  [-] 30分 [+]             │
├─────────────────────────┤
│  朝のタスク               │
│  ● 顔を洗う     [x]      │
│  [入力欄        ] [+]    │
├─────────────────────────┤
│  🔥 3日連続 / 週間 / 睡眠 │
└─────────────────────────┘
```

#### Idle（TODOなし）

- **条件**: `session === null && target.todos.length === 0`
- **スクリーンショット**: `dashboard--idle-no-todos.png` (未撮影)

```
┌─────────────────────────┐
│     明日, 月曜日          │
│       07:00              │
├─────────────────────────┤
│  朝のタスク               │
│  「タスクなし」           │
│  [入力欄        ] [+]    │
└─────────────────────────┘
```

#### Session Active（ゴール内）

- **条件**: `session !== null && !goalExceeded`
- **スクリーンショット**: `dashboard--session-active.png` (未撮影)

```
┌─────────────────────────┐
│     明日, 月曜日          │
│       07:00              │
├─────────────────────────┤
│  今朝のルーティン         │
│  ████████░░  3/5         │
│  目標まで 12:34          │
│  次のスヌーズ 3:45       │
│  ☐ 顔を洗う              │
│  ☑ 水を飲む              │
└─────────────────────────┘
```

> **UX メモ**: GoalBufferSection / TodoEditSection が消え、MorningRoutineSection が表示。セッション中はタスク追加・削除不可。

#### Session Active（ゴール超過）

- **条件**: `session !== null && goalExceeded`
- **スクリーンショット**: `dashboard--session-exceeded.png` (未撮影)

> **UX メモ**: goalRemaining が赤系テキスト (colors.primary) で「目標を X:XX 超過!」と表示。

#### AlarmKit エラー

- **条件**: `!isAlarmKitAvailable()`
- **スクリーンショット**: `dashboard--alarmkit-error.png` (未撮影)

> **UX メモ**: 赤背景バナーがスクロール最上部に表示。タップアクションなし — 設定→権限への導線がない。

---

## 2. 設定 (`app/(tabs)/settings.tsx`)

アラーム有効/無効、権限管理、日付変更ラインの設定。

### 状態一覧

| 状態 | 条件 | スクリーンショット |
|------|------|-------------------|
| 通常（アラーム有効） | `target.enabled === true` | `settings--alarm-enabled.png` |
| 通常（アラーム無効） | `target.enabled === false` | `settings--alarm-disabled.png` |
| 権限 denied 後 | `permissionStatuses[perm.id] === "denied" → Alert表示` | `settings--permission-denied.png` |

#### 通常（アラーム有効）

- **条件**: `target.enabled === true`
- **スクリーンショット**: `settings--alarm-enabled.png` (未撮影)

```
┌─────────────────────────┐
│  スケジュール        [>] │
├─────────────────────────┤
│  有効              [⊙]  │
├─────────────────────────┤
│  日付変更ライン          │
├─────────────────────────┤
│  権限                    │
│  🔔 AlarmKit   [Granted] │
│  ❤️ HealthKit  [Denied]  │
├─────────────────────────┤
│  Version 1.x.x           │
└─────────────────────────┘
```

#### 通常（アラーム無効）

- **条件**: `target.enabled === false`
- **スクリーンショット**: `settings--alarm-disabled.png` (未撮影)

#### 権限 denied 後

- **条件**: `permissionStatuses[perm.id] === "denied" → Alert表示`
- **スクリーンショット**: `settings--permission-denied.png` (未撮影)

> **UX メモ**: Alert で「設定アプリへ」とガイドするが、Linking.openSettings() へのボタンがない

---

## 3. オンボーディング (`app/onboarding.tsx`)

初回起動時の6ステップウィザード。時刻設定・TODO登録・権限リクエスト。

### 状態一覧

| 状態 | 条件 | スクリーンショット |
|------|------|-------------------|
| Step 0: Welcome | `step === 0` | `onboarding--step0-welcome.png` |
| Step 1: Time | `step === 1` | `onboarding--step1-time.png` |
| Step 2: Todos | `step === 2` | `onboarding--step2-todos.png` |
| Step 3: Permission | `step === 3` | `onboarding--step3-permission.png` |
| Step 4: Confirm | `step === 4` | `onboarding--step4-confirm.png` |
| Step 5: Demo | `step === 5` | `onboarding--step5-demo.png` |

#### Step 0: Welcome

- **条件**: `step === 0`
- **スクリーンショット**: `onboarding--step0-welcome.png` (未撮影)

#### Step 1: Time

- **条件**: `step === 1`
- **スクリーンショット**: `onboarding--step1-time.png` (未撮影)

#### Step 2: Todos

- **条件**: `step === 2`
- **スクリーンショット**: `onboarding--step2-todos.png` (未撮影)

#### Step 3: Permission

- **条件**: `step === 3`
- **スクリーンショット**: `onboarding--step3-permission.png` (未撮影)

#### Step 4: Confirm

- **条件**: `step === 4`
- **スクリーンショット**: `onboarding--step4-confirm.png` (未撮影)

#### Step 5: Demo

- **条件**: `step === 5`
- **スクリーンショット**: `onboarding--step5-demo.png` (未撮影)

---

## 4. 時刻変更 (`app/target-edit.tsx`)

起床時刻の変更。「明日だけ」と「デフォルト変更」の2モード。

### 状態一覧

| 状態 | 条件 | スクリーンショット |
|------|------|-------------------|
| 明日だけ変更モード | `mode === "tomorrowOnly"` | `target-edit--tomorrow-only.png` |
| デフォルト変更モード | `mode === "changeDefault"` | `target-edit--change-default.png` |

#### 明日だけ変更モード

- **条件**: `mode === "tomorrowOnly"`
- **スクリーンショット**: `target-edit--tomorrow-only.png` (未撮影)

```
┌─────────────────────────┐
│      起床時刻を変更       │
│         ▲    ▲          │
│       07  :  00          │
│         ▼    ▼          │
├─────────────────────────┤
│ ◉ 明日だけ変更           │
│ ○ デフォルトを変更        │
├─────────────────────────┤
│      [ 保存 ]            │
└─────────────────────────┘
```

> **UX メモ**: 現在の値と変更後の差分が視覚的に分からない

#### デフォルト変更モード

- **条件**: `mode === "changeDefault"`
- **スクリーンショット**: `target-edit--change-default.png` (未撮影)

---

## 5. スケジュール (`app/schedule.tsx`)

曜日ごとのアラーム時刻設定。デフォルト/カスタム/OFFの3状態。

### 状態一覧

| 状態 | 条件 | スクリーンショット |
|------|------|-------------------|
| Loading | `target === null` | `schedule--loading.png` |
| 全曜日デフォルト | `dayOverrides が空` | `schedule--all-default.png` |
| カスタムあり + 編集中 | `一部の曜日にオーバーライド && editingDay !== null` | `schedule--with-overrides.png` |

#### Loading

- **条件**: `target === null`
- **スクリーンショット**: `schedule--loading.png` (未撮影)

#### 全曜日デフォルト

- **条件**: `dayOverrides が空`
- **スクリーンショット**: `schedule--all-default.png` (未撮影)

#### カスタムあり + 編集中

- **条件**: `一部の曜日にオーバーライド && editingDay !== null`
- **スクリーンショット**: `schedule--with-overrides.png` (未撮影)

```
┌─────────────────────────┐
│  デフォルト: 07:00       │
├─────────────────────────┤
│  月  デフォルト   07:00  │
│  火  カスタム    08:00   │
│  ┌── ピッカー ──────────┐│
│  │  ▲ 08 : 00 ▲       ││
│  └─────────────────────┘│
│  水  OFF        OFF     │
└─────────────────────────┘
```

> **UX メモ**: 曜日タップ: default→custom→off→default のサイクル。直感的でない可能性。

---

## 6. 日次レビュー (`app/day-review.tsx`)

特定日の起床記録・睡眠データ・デイリーグレードを確認する。

### 状態一覧

| 状態 | 条件 | スクリーンショット |
|------|------|-------------------|
| 記録なし | `record === undefined && gradeRecord === undefined` | `day-review--no-record.png` |
| アラーム記録あり（TODO含む） | `record !== undefined && record.todos.length > 0` | `day-review--with-record.png` |
| アラーム未使用 + グレードあり | `record === undefined && gradeRecord !== undefined` | `day-review--no-alarm.png` |

#### 記録なし

- **条件**: `record === undefined && gradeRecord === undefined`
- **スクリーンショット**: `day-review--no-record.png` (未撮影)

#### アラーム記録あり（TODO含む）

- **条件**: `record !== undefined && record.todos.length > 0`
- **スクリーンショット**: `day-review--with-record.png` (未撮影)

```
┌─────────────────────────┐
│     2026-03-22           │
│     [ Great ]            │
├─────────────────────────┤
│  目標 07:00 / 実際 06:55 │
│  結果 -5 min             │
├─────────────────────────┤
│  ✓ 顔を洗う              │
│  ○ 水を飲む              │
├─────────────────────────┤
│  睡眠データ / グレード    │
└─────────────────────────┘
```

#### アラーム未使用 + グレードあり

- **条件**: `record === undefined && gradeRecord !== undefined`
- **スクリーンショット**: `day-review--no-alarm.png` (未撮影)

> **UX メモ**: アラーム未使用日でも useGradeFinalization がグレードを自動生成するため、この状態が発生する

---

## 7. タブバー（共通） (`app/(tabs)/_layout.tsx`)

タブバー + MorningRoutineBanner。セッション中はバナーが表示。

### 状態一覧

| 状態 | 条件 | スクリーンショット |
|------|------|-------------------|
| セッションなし | `session === null` | `tabbar--no-session.png` |
| セッション中（バナー表示） | `session !== null` | `tabbar--with-banner.png` |

#### セッションなし

- **条件**: `session === null`
- **スクリーンショット**: `tabbar--no-session.png` (未撮影)

#### セッション中（バナー表示）

- **条件**: `session !== null`
- **スクリーンショット**: `tabbar--with-banner.png` (未撮影)

> **UX メモ**: タブバーの上にバナーが表示。設定タブに切り替えても進捗が見える。

---

## UX 改善候補

### P1: 高優先度

- Loading 画面にスピナーがない — テキストのみで、初回起動の長時間ロードで不安を与える
- AlarmKit エラーバナーに解決導線がない — 「設定へ」ボタンが必要

### P2: 中優先度

- target-edit の差分表示なし — 現在値 → 変更値の比較ができない
- スケジュールの状態遷移 — default→custom→off→default のサイクルが分かりにくい
- 権限 denied 時の設定アプリ遷移 — Alert のみでリンクなし（Linking.openSettings() を使うべき）
- セッション中に TODO 追加不可 — 忘れていたタスクを追加したい場合の手段がない

### P3: 低優先度

- WeeklyStatsCard — レコード0件で非表示だが、初回ユーザーにはガイドテキストがあるとよい
- 日次レビューの日付フォーマット — ISO形式 (2026-03-22) でユーザーフレンドリーではない
- SleepCard の空状態 — HealthKit データなし時のフォールバック表示

---

*Generated at 2026-03-23T02:00:19 from `src/docs/screen-states.ts`*
