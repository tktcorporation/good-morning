# UI 状態カタログ

各画面のすべてのUI状態を網羅する。UX改善・デザインレビュー時にこのドキュメントを参照し、
改善対象の画面と状態を特定する。

> **スクリーンショット**: `docs/screenshots/` に配置する。
> ファイル名は `{画面名}--{状態名}.png`（例: `dashboard--loading.png`）。
> 実機で Expo dev tools または Xcode でキャプチャし、各状態を再現して撮影する。

---

## 画面一覧

| # | 画面 | ルート | 種別 | 状態数 |
|---|------|--------|------|--------|
| 1 | ダッシュボード | `/(tabs)/index` | タブ | 6 |
| 2 | 設定 | `/(tabs)/settings` | タブ | 3 |
| 3 | オンボーディング | `/onboarding` | スタック | 6 (各ステップ) |
| 4 | 時刻変更 | `/target-edit` | モーダル | 2 |
| 5 | スケジュール | `/schedule` | モーダル | 3 |
| 6 | 日次レビュー | `/day-review` | モーダル | 4 |
| 7 | タブバー (共通) | `/(tabs)/_layout` | レイアウト | 2 |

---

## 1. ダッシュボード (`app/(tabs)/index.tsx`)

メインハブ。アラーム時刻、TODO進捗、週間統計を表示する。

### 状態一覧

| 状態 | 条件 | スクリーンショット |
|------|------|-------------------|
| Loading | `loaded === false` | `dashboard--loading.png` |
| Idle（セッションなし・TODOあり） | `session === null && target.todos.length > 0` | `dashboard--idle-with-todos.png` |
| Idle（セッションなし・TODOなし） | `session === null && target.todos.length === 0` | `dashboard--idle-no-todos.png` |
| Session Active（ゴール内） | `session !== null && !goalExceeded` | `dashboard--session-active.png` |
| Session Active（ゴール超過） | `session !== null && goalExceeded` | `dashboard--session-exceeded.png` |
| AlarmKit エラー | `!isAlarmKitAvailable()` | `dashboard--alarmkit-error.png` |

### 各状態の構成要素

#### Loading
```
┌─────────────────────────┐
│                         │
│       Loading...        │  ← 中央配置テキスト
│                         │
└─────────────────────────┘
```
- **表示**: "Loading..." テキストのみ
- **UX メモ**: スピナーなし、テキストのみ。初回起動で数秒かかる場合にユーザーが不安に感じる可能性

#### Idle（セッションなし）
```
┌─────────────────────────┐
│  [AlarmKit エラーバナー]  │  ← 条件付き
├─────────────────────────┤
│     明日, 月曜日          │
│       07:00              │  ← タップで target-edit へ
│     [OVERRIDE]           │  ← nextOverride がある場合のみ
├─────────────────────────┤
│  睡眠時間カード            │  ← SleepDurationCard
│  7h → 23:00 就寝          │
├─────────────────────────┤
│  起床目標バッファ          │  ← GoalBufferSection
│  [-] 30分 [+]             │
│  目標: 07:30              │
├─────────────────────────┤
│  朝のタスク               │  ← TodoEditSection
│  ● 顔を洗う     [x]      │  ← TODOあり時: 一覧 + 削除ボタン
│  ● 水を飲む     [x]      │
│  [入力欄        ] [+]    │  ← 追加用
│  ---                     │
│  「タスクなし」           │  ← TODOなし時: 空メッセージ
├─────────────────────────┤
│  🔥 3日連続               │  ← StreakBadge
├─────────────────────────┤
│  週間カレンダー           │  ← WeeklyCalendar (GradeIcon × 7日)
│  月 火 水 木 金 土 日     │
├─────────────────────────┤
│  今日の睡眠              │  ← SleepCard
├─────────────────────────┤
│  週間スタッツ            │  ← WeeklyStatsCard (records > 0 の場合のみ)
│  5/7 成功                │
└─────────────────────────┘
```

#### Session Active（朝ルーティン中）
```
┌─────────────────────────┐
│     明日, 月曜日          │
│       07:00              │
├─────────────────────────┤
│  睡眠時間カード            │
├─────────────────────────┤
│  ★ GoalBufferSection 非表示 ★
├─────────────────────────┤
│  今朝のルーティン         │  ← MorningRoutineSection
│  ████████░░  3/5         │  ← プログレスバー
│  目標まで 12:34          │  ← goalRemaining (ゴール内: 青系)
│  目標を 5:32 超過!       │  ← goalRemaining (ゴール超過: 赤系)
│  次のスヌーズ 3:45       │  ← snoozeRemaining (あれば)
│  ☐ 顔を洗う              │  ← TodoListItem (チェック可)
│  ☑ 水を飲む              │
├─────────────────────────┤
│  🔥 3日連続               │
│  週間カレンダー / 睡眠 / 統計 │
└─────────────────────────┘
```

- **違い**: GoalBufferSection / TodoEditSection が消え、MorningRoutineSection が表示
- **UX メモ**: セッション中はタスク追加・削除ができない（テンプレートはセッション開始時にコピー済み）

#### AlarmKit エラーバナー
- **表示条件**: `isAlarmKitAvailable()` が `false`
- **見た目**: 赤背景 + 赤ボーダーのバナーがスクロール最上部に表示
- **UX メモ**: タップアクションなし。ユーザーが設定→権限で解決すべきだが導線がない

---

## 2. 設定 (`app/(tabs)/settings.tsx`)

### 状態一覧

| 状態 | 条件 | スクリーンショット |
|------|------|-------------------|
| 通常 | - | `settings--normal.png` |
| アラーム有効 | `target.enabled === true` | `settings--alarm-enabled.png` |
| アラーム無効 | `target.enabled === false` | `settings--alarm-disabled.png` |

### 画面構成
```
┌─────────────────────────┐
│  スケジュール        [>] │  ← /schedule へ遷移
├─────────────────────────┤
│  有効 / 無効       [⊙]  │  ← Switch (enabled ? "有効" : "無効")
├─────────────────────────┤
│  日付変更ライン          │
│  DayBoundaryPicker       │  ← 時刻選択 (0-23)
├─────────────────────────┤
│  権限                    │
│  🔔 AlarmKit   [Granted] │  ← 緑バッジ or オレンジバッジ
│  ❤️ HealthKit  [Denied]  │
├─────────────────────────┤
│  このアプリについて       │
│  Version 1.x.x           │
│  説明テキスト             │
└─────────────────────────┘
```

### 権限状態の遷移
```
pending → (request) → granted  (緑 "Granted", 非活性)
pending → (request) → denied   (オレンジ "Denied", タップ可 → Alert)
```

- **UX メモ**: 権限が `denied` の場合、タップで再リクエストするが iOS は2回目以降拒否する。Alert で「設定アプリへ」とガイドするが、設定アプリへの直接遷移ボタンがない

---

## 3. オンボーディング (`app/onboarding.tsx`)

### 6ステップのウィザード

| ステップ | コンポーネント | 説明 | スクリーンショット |
|---------|--------------|------|-------------------|
| 0 | WelcomeStep | アプリ紹介 | `onboarding--step0-welcome.png` |
| 1 | TimeStep | デフォルト起床時刻の設定 | `onboarding--step1-time.png` |
| 2 | TodosStep | 朝タスクの登録 | `onboarding--step2-todos.png` |
| 3 | PermissionStep | OS権限リクエスト | `onboarding--step3-permission.png` |
| 4 | ConfirmStep | アラーム有効/無効の確認 | `onboarding--step4-confirm.png` |
| 5 | DemoStep | デモサウンド再生 | `onboarding--step5-demo.png` |

### 共通UIフレーム
```
┌─────────────────────────┐
│    ○ ○ ●━━ ○ ○ ○       │  ← ドットインジケーター (アクティブは幅24)
├─────────────────────────┤
│                         │
│   [各ステップの内容]     │  ← ステップごとに差し替え
│                         │
│   [戻る]    [次へ]      │
└─────────────────────────┘
```

- **UX メモ**: 「戻る」ボタンは step === 0 では表示されない。ドットは `colors.border`（非活性）/ `colors.primary`（活性）

---

## 4. 時刻変更 (`app/target-edit.tsx`)

### 状態一覧

| 状態 | 条件 | スクリーンショット |
|------|------|-------------------|
| 明日だけ変更モード | `mode === 'tomorrowOnly'` | `target-edit--tomorrow-only.png` |
| デフォルト変更モード | `mode === 'changeDefault'` | `target-edit--change-default.png` |

### 画面構成
```
┌─────────────────────────┐
│      起床時刻を変更       │
├─────────────────────────┤
│         ▲    ▲          │
│       07  :  00          │  ← 5分刻みで調整
│         ▼    ▼          │
├─────────────────────────┤
│ ◉ 明日だけ変更           │  ← ラジオボタン
│ ○ デフォルトを変更        │
├─────────────────────────┤
│      [ 保存 ]            │  ← プライマリボタン
└─────────────────────────┘
```

- **UX メモ**: 現在の値と変更後の差分が視覚的に分からない。「現在の設定: 06:00 → 変更: 07:00」のような差分表示がない

---

## 5. スケジュール (`app/schedule.tsx`)

### 状態一覧

| 状態 | 条件 | スクリーンショット |
|------|------|-------------------|
| Loading | `target === null` | `schedule--loading.png` |
| 全曜日デフォルト | `dayOverrides` が空 | `schedule--all-default.png` |
| カスタムあり | 一部の曜日にオーバーライド | `schedule--with-overrides.png` |

### 曜日ごとの3状態
```
┌─────────────────────────┐
│  デフォルト: 07:00       │  ← 上部に表示
├─────────────────────────┤
│  月曜日                  │
│  デフォルト使用   07:00  │  ← state=default: グレー背景
├─────────────────────────┤
│  火曜日                  │
│  カスタム時刻    08:00   │  ← state=custom: ハイライト背景
│  ┌── インラインピッカー ─┐│
│  │    ▲    ▲           ││
│  │  08  :  00           ││  ← editingDay === day の場合のみ表示
│  │    ▼    ▼           ││
│  └─────────────────────┘│
├─────────────────────────┤
│  水曜日                  │
│  OFF            OFF     │  ← state=off: テキスト色がミュート
└─────────────────────────┘
```

### 曜日タップ時の状態遷移
```
default → custom (ピッカー表示) → off (ピッカー非表示) → default
```

- **UX メモ**: 状態遷移のサイクルが直感的でない可能性（custom→off が「もう1回タップ」で切り替わる）

---

## 6. 日次レビュー (`app/day-review.tsx`)

### 状態一覧

| 状態 | 条件 | スクリーンショット |
|------|------|-------------------|
| 記録なし | `record === undefined && gradeRecord === undefined` | `day-review--no-record.png` |
| アラーム記録あり | `record !== undefined` | `day-review--with-record.png` |
| アラーム未使用 + グレードあり | `record === undefined && gradeRecord !== undefined` | `day-review--no-alarm.png` |
| 全データあり（TODO含む） | `record !== undefined && record.todos.length > 0` | `day-review--full-data.png` |

### 「記録なし」状態
```
┌─────────────────────────┐
│                         │
│  この日の記録はありません  │  ← 中央配置
│                         │
└─────────────────────────┘
```

### 「全データあり」状態
```
┌─────────────────────────┐
│     2026-03-22           │
├─────────────────────────┤
│     [ Great ]            │  ← 結果バッジ (色付き pill)
├─────────────────────────┤
│  目標      07:00         │
│  実際      06:55         │
│  結果      -5 min        │  ← 色: RESULT_COLORS[result]
├─────────────────────────┤
│  タスク完了状況           │  ← record.todos.length > 0 の場合のみ
│  ✓ 顔を洗う              │  ← 完了: 取り消し線
│  ○ 水を飲む              │  ← 未完了
├─────────────────────────┤
│  睡眠データ              │  ← SleepDetailSection
├─────────────────────────┤
│  デイリーグレード         │  ← DailyGradeSection
│  朝: Pass / 夜: On Time  │
│  グレード: Excellent      │
└─────────────────────────┘
```

### 結果バッジの色分け (`RESULT_COLORS`)
| 結果 | ラベル | 色 |
|------|-------|----|
| great | Great | 緑系 |
| ok | OK | 青系 |
| late | Late | オレンジ系 |
| missed | Missed | 赤系 |

---

## 7. タブバー共通 (`app/(tabs)/_layout.tsx`)

### 状態一覧

| 状態 | 条件 | スクリーンショット |
|------|------|-------------------|
| セッションなし | `session === null` | `tabbar--no-session.png` |
| セッション中 | `session !== null` | `tabbar--with-banner.png` |

### MorningRoutineBanner
タブバーの **上** にセッション中のみ表示されるバナー。

```
┌─────────────────────────┐
│  MorningRoutineBanner    │  ← セッション中のみ
├─────────────────────────┤
│  🏠 ダッシュ  ⚙ 設定    │  ← タブバー
└─────────────────────────┘
```

- **UX メモ**: 設定タブに切り替えても進捗が見える。ただしバナーのタップで何が起きるかはコンポーネント実装による

---

## スクリーンショット撮影ガイド

### 必要な環境
- iOS 実機 or シミュレータ
- Expo dev server (`pnpm start`)
- 各状態を再現するためのテストデータ

### 各状態の再現方法

| 状態 | 再現手順 |
|------|---------|
| Dashboard Loading | AsyncStorage を全クリアしてアプリ起動 |
| Dashboard Idle (TODOあり) | オンボーディング完了後の通常状態 |
| Dashboard Idle (TODOなし) | 全TODOを削除 |
| Dashboard Session Active | アラーム発火後にdismiss（デモモードで再現可能） |
| Dashboard Session Exceeded | セッション開始後、goalDeadline を過去に設定 |
| Dashboard AlarmKit Error | AlarmKit 権限を拒否 |
| Settings Normal | 通常状態 |
| Settings Alarm Disabled | アラームスイッチをOFF |
| Onboarding Step 0-5 | オンボーディング未完了で起動し、各ステップへ進む |
| Target Edit | ダッシュボードの時刻をタップ |
| Schedule All Default | オーバーライドなし |
| Schedule With Overrides | 曜日をタップしてカスタム/OFFに変更 |
| Day Review No Record | 記録のない日をタップ |
| Day Review Full Data | アラーム記録がある日をタップ |

---

## 画面遷移フロー図

```
                    ┌─────────────┐
                    │ App Launch  │
                    └─────┬───────┘
                          │
                    ┌─────▼───────┐     NO     ┌──────────────┐
                    │ Onboarding  ├────────────►│ /(tabs)      │
                    │ Completed?  │             │  ┌──────────┐│
                    └─────┬───────┘             │  │Dashboard ││
                     YES  │                     │  └────┬─────┘│
                          │                     │       │      │
                    ┌─────▼───────┐             │  ┌────▼─────┐│
                    │ /onboarding │             │  │ Settings ││
                    │ (6 steps)   │             │  └──────────┘│
                    └─────┬───────┘             └──────────────┘
                          │ complete                 │  │  │
                          └─────────────────────────►│  │  │
                                                     │  │  │
                                          ┌──────────┘  │  └──────────┐
                                          ▼             ▼             ▼
                                   /target-edit    /schedule     /day-review
                                   (モーダル)      (モーダル)    (モーダル)
```

### アラーム発火フロー
```
AlarmKit 発火 → _layout.tsx handleAlarmEventEffect
                     │
                     ├─ 初回アラーム: router.push('/') → Dashboard (Session Active)
                     │
                     └─ スヌーズ再発火: Live Activity 更新 → router.push('/')
```

---

## UX 改善候補（コードリーディングから抽出）

> 以下は実装を読んで発見した改善ポイント。優先度付けは実際のスクリーンショット確認後に行う。

### P1: 高優先度
1. **Loading 画面にスピナーがない** — テキストのみで、初回起動の長時間ロードで不安を与える
2. **AlarmKit エラーバナーに解決導線がない** — 「設定へ」ボタンが必要
3. **wakeup 画面が存在しない** — `user-flows.md` には記載あるが実装なし。アラーム解除UIが不明

### P2: 中優先度
4. **target-edit の差分表示なし** — 現在値 → 変更値の比較ができない
5. **スケジュールの状態遷移** — default→custom→off→default のサイクルが分かりにくい
6. **権限 denied 時の設定アプリ遷移** — Alert のみでリンクなし（`Linking.openSettings()` を使うべき）
7. **セッション中に TODO 追加不可** — 忘れていたタスクを追加したい場合の手段がない

### P3: 低優先度
8. **WeeklyStatsCard の条件** — レコード0件で非表示だが、初回ユーザーにはガイドテキストがあるとよい
9. **日次レビューの日付フォーマット** — "2026-03-22" のような ISO 形式で、ユーザーフレンドリーではない
10. **SleepCard の空状態** — HealthKit データなし時のフォールバック表示
