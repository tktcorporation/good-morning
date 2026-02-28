# ユーザーフロー

アプリの主要なユーザーフローを記述する。機能追加・修正時にこのドキュメントを更新し、実装との整合性を保つこと。

## 1. アラーム設定フロー

```
ダッシュボード
  └─ 起床時刻タップ → target-edit 画面
       ├─ 「明日だけ変更」 → nextOverride を設定
       └─ 「デフォルトを変更」 → defaultTime を変更
  └─ _layout.tsx の target effect が変更を検知
       └─ scheduleWakeTargetAlarm() でネイティブアラームをスケジュール
```

**関連ファイル**: `app/target-edit.tsx`, `app/_layout.tsx`, `src/stores/wake-target-store.ts`

## 2. アラーム発火 → 起床フロー

```
AlarmKit がネイティブアラームを発火
  └─ アプリが foreground に遷移
  └─ _layout.tsx の初期化 effect
       ├─ loadTarget(), loadRecords(), loadSession(), loadSettings() を並行実行
       ├─ checkLaunchPayload() で payload 取得
       └─ payload の isSnooze フラグで分岐:
            ├─ isSnooze=false (初回アラーム):
            │    └─ router.push('/wakeup') → wakeup 画面表示
            └─ isSnooze=true (スヌーズ再発火):
                 └─ sessionLoaded.then() で loadSession 完了を待機
                      └─ handleSnoozeArrival() → 次のスヌーズをスケジュール
                      └─ router.push('/') → ダッシュボードへ
```

**関連ファイル**: `app/_layout.tsx`, `src/services/snooze.ts`

## 3. wakeup 画面 → アラーム解除フロー

```
wakeup 画面が表示される
  ├─ バイブレーション開始（AlarmKit が既にシステム音を再生済み）
  └─ 「dismiss」ボタンを押す → handleDismiss()
       ├─ cancelAllAlarms() でスケジュール済みアラームをキャンセル
       ├─ WakeRecord を作成 (addRecord)
       ├─ TODO がある場合:
       │    ├─ MorningSession を作成 (startSession)
       │    ├─ スヌーズを先行スケジュール (scheduleSnoozeAlarms)
       │    │    └─ dismiss 時点から9分間隔 × 20本（3時間分）を一括スケジュール
       │    │    └─ snoozeAlarmIds をセッションストアに保存
       │    └─ Live Activity を開始 (startLiveActivity)
       ├─ TODO がない場合:
       │    └─ （HealthKit 睡眠データはダッシュボード表示時に useDailySummary が自動同期）
       ├─ nextOverride をクリア (clearNextOverride)
       │    └─ target が変更 → _layout.tsx の target effect が次回アラームを再スケジュール
       └─ router.replace('/') → ダッシュボードへ
```

**関連ファイル**: `app/wakeup.tsx`, `src/stores/morning-session-store.ts`

### デモモード

```
設定画面 → 「テストサウンド」 → router.push('/wakeup?demo=true')
  └─ アラーム音を3秒間再生
  └─ dismiss → router.back()（セッション・レコードは作成しない）
```

## 4. 朝のルーティン（TODO チェック）フロー

```
ダッシュボード（セッションがアクティブな状態）
  └─ 「今朝のルーティン」セクションが表示される:
       ├─ プログレスバー (completed / total)
       ├─ スヌーズカウントダウン (M:SS)
       └─ TODO リスト（チェックボックス付き）
            └─ ユーザーがチェックボックスをタップ
                 └─ handleToggleTodo(todoId)
                      ├─ toggleTodo() でセッションの completed を反転
                      └─ updateLiveActivity() でロック画面の表示を更新
```

**注意**: TODO チェック機能はセッションがアクティブな時のみ利用可能。セッション外のダッシュボードでは、TODO はテンプレート（追加・削除のみ）として表示される。

**関連ファイル**: `app/(tabs)/index.tsx`, `src/components/TodoListItem.tsx`, `src/stores/morning-session-store.ts`

### セッション外の TODO テンプレート

```
ダッシュボード（セッションが非アクティブ）
  └─ 「朝のタスク」セクション:
       ├─ 説明テキスト「アラーム解除後にチェックリストとして表示されます」
       ├─ 登録済み TODO リスト（● bullet + 削除ボタン）
       └─ 新規追加 (TextInput + "+" ボタン)
  └─ ここで追加した TODO が、次のアラーム解除時にセッションの TODO にコピーされる
```

## 5. TODO 全完了 → セッション終了フロー

```
最後の TODO にチェック → areAllCompleted() === true
  └─ completion effect が発火 (index.tsx)
       ├─ 1. cancelAllAlarms() — ネイティブ側の全アラームをキャンセル
       │    └─ scheduleWakeTargetAlarm() で通常アラームを再スケジュール
       ├─ 2. endLiveActivity(liveActivityId) — ロック画面ウィジェットを終了 (fire-and-forget)
       ├─ 3. updateRecord() — 完了時刻・所要時間を WakeRecord に保存
       └─ 4. .then(() => clearSession()) — セッション + snooze/activity ID をクリア
            └─ ダッシュボードが再レンダリング → テンプレート TODO リストに戻る
```

**順序が重要**: liveActivityId は clearSession() で消えるため、先に参照してからクリアする。cancelAllAlarms は全アラーム（スヌーズ含む）をキャンセルし、その後 scheduleWakeTargetAlarm で通常アラームを復元する。

**関連ファイル**: `app/(tabs)/index.tsx`, `src/services/alarm-kit.ts`

## 6. スヌーズ再発火フロー

```
先行スケジュール済みスヌーズアラームが発火
  └─ アプリが foreground に遷移
  └─ _layout.tsx 初期化 → isSnooze=true を検出
       └─ sessionLoaded を await
       └─ handleSnoozeArrival()
            ├─ session が存在 & 未完了 TODO あり:
            │    ├─ snoozeFiresAt を次の発火時刻に更新（カウントダウン表示用）
            │    └─ Live Activity を更新 (updateLiveActivity)
            └─ session なし or TODO 全完了:
                 └─ 何もしない（残りのスヌーズは TODO 全完了時にキャンセル済み）
       └─ router.push('/') → ダッシュボードへ
```

**注意**: 先行スケジュール方式のため、発火時の再スケジュールは不要。Live Activity の更新のみ行う。

**関連ファイル**: `app/_layout.tsx`, `src/services/snooze.ts`

## 7. アプリ再起動時の復元フロー

```
アプリ起動（アラーム経由でない通常起動）
  └─ _layout.tsx 初期化
       ├─ loadSession() — AsyncStorage からセッションを復元
       │    └─ セッションがあれば「今朝のルーティン」セクションを表示
       │    └─ liveActivityId マイグレーション: 旧データの undefined → null
       │       （snoozeAlarmIds, snoozeFiresAt はメモリのみのため消失。
       │        ただし先行スケジュール済みスヌーズはネイティブ側で発火し続ける）
       ├─ loadTarget() — 期限切れ nextOverride を自動クリア
       └─ checkLaunchPayload() → null（通常起動なので payload なし）
```

**関連ファイル**: `app/_layout.tsx`, `src/stores/morning-session-store.ts`

## 8. オンボーディングフロー

```
初回起動（onboarding-completed が AsyncStorage にない）
  └─ _layout.tsx: onboardingDone === false を検知
       └─ router.replace('/onboarding')
  └─ 6ステップのウィザード:
       1. Welcome — アプリ説明
       2. Time — デフォルト起床時刻を設定
       3. Todos — 朝のタスクを登録
       4. Permission — 通知/HealthKit 権限リクエスト
       5. Confirm — アラーム有効/無効を選択
       6. Demo — テストサウンドを再生
  └─ handleComplete()
       ├─ setTarget() で WakeTarget を永続化
       ├─ AsyncStorage に onboarding-completed = 'true' を保存
       └─ router.replace('/') → ダッシュボードへ
            └─ _layout.tsx の target effect が発火 → アラームスケジュール
```

**関連ファイル**: `app/onboarding.tsx`, `src/components/onboarding/`

## 9. 設定画面フロー

```
タブの「設定」をタップ
  └─ settings.tsx が表示される:
       ├─ スケジュール → router.push('/schedule')
       ├─ アラーム有効/無効スイッチ → toggleEnabled()
       │    └─ target 変更 → _layout.tsx の target effect でアラーム再スケジュール
       ├─ アラーム音選択 → setSoundId() + 3秒プレビュー再生
       ├─ 日付変更ライン (dayBoundaryHour) → setDayBoundaryHour()
       ├─ 就寝目標時刻 → BedtimePickerModal → setBedtimeTarget()
       ├─ 権限管理 → 各権限の request() を実行
       └─ バージョン情報表示
```

**関連ファイル**: `app/(tabs)/settings.tsx`, `src/stores/settings-store.ts`

## 10. day-review（日次レビュー）フロー

```
ダッシュボードの週間カレンダーで日付タップ
  └─ router.push('/day-review?date=YYYY-MM-DD')
  └─ day-review 画面:
       ├─ WakeRecord あり: 結果バッジ + 時刻情報 + TODO完了状況
       ├─ WakeRecord なし + DailyGradeRecord あり: グレードのみ表示
       ├─ 両方なし: 「記録なし」表示
       ├─ 睡眠データセクション (SleepDetailSection via useDailySummary)
       └─ Daily Grade セクション (DailyGradeSection)
```

**関連ファイル**: `app/day-review.tsx`, `src/hooks/useDailySummary.ts`

## 11. デイリーグレード自動確定フロー

```
ダッシュボード表示時（useGradeFinalization）
  └─ 全ストアのロード完了を待機
  └─ hasFinalized フラグで1セッション1回のみ実行
  └─ streak.lastGradedDate の翌日 〜 昨日を走査（最大7日分）:
       ├─ 各日の WakeRecord を検索（getLogicalDateString で dayBoundaryHour 考慮）
       ├─ 昨日分のみ HealthKit 就寝データを取得
       ├─ buildGradeRecord() でグレード算出
       │    ├─ morningPass: WakeRecord.result が great/ok なら合格
       │    ├─ nightPass: bedtimeTarget 内に就寝なら合格
       │    └─ grade: 両方合格=excellent, 朝のみ=good, 夜のみ=fair, 両方不合格=poor
       └─ addGrade() でストリーク更新 + 永続化
```

**関連ファイル**: `src/hooks/useGradeFinalization.ts`, `src/services/grade-finalizer.ts`, `src/services/grade-calculator.ts`

## 12. バックグラウンド復帰時のスヌーズ検知フロー

```
アプリがバックグラウンド → フォアグラウンドに復帰
  └─ _layout.tsx の AppState リスナーが 'active' を検知
       └─ checkLaunchPayload() でスヌーズ payload を確認
            ├─ isSnooze=true: handleSnoozeArrival() で Live Activity 更新
            └─ isSnooze=false or null: 何もしない
```

**注意**: 初期化 effect（useEffect）は再実行されない。AppState リスナーで対応。

**関連ファイル**: `app/_layout.tsx`

## 状態のライフサイクルまとめ

| 状態 | 作成タイミング | 破棄タイミング | 永続化 |
|------|--------------|--------------|--------|
| WakeTarget | 初回起動時 (DEFAULT) | 削除されない | AsyncStorage |
| WakeRecord | アラーム dismiss 時 | 削除されない | AsyncStorage |
| MorningSession | アラーム dismiss 時（TODO あり） | TODO 全完了時 | AsyncStorage |
| snoozeAlarmIds | アラーム dismiss 時（先行一括スケジュール） | セッションクリア時 | メモリのみ |
| snoozeFiresAt | アラーム dismiss 時 / スヌーズ発火時 | セッションクリア時 | メモリのみ |
| liveActivityId | Live Activity 開始時 | セッションクリア時 | AsyncStorage（session 内） |

## 設定UXオーバーホール — ユーザーフロー検証

### フロー1: 初回設定
1. アプリ初回起動 → メイン画面
2. アラーム時刻設定済み、目標睡眠時間は未設定
3. 「目標睡眠時間を設定」リンクが表示される
4. タップ → ピッカーモーダル → 7h を選択 → 保存
5. メイン画面に「7h → 23:00 就寝」と表示
6. 成立

### フロー2: 日付変更ライン変更
1. 設定画面 → Day Boundary セクション
2. 現在値「3:00」が表示される
3. タップ → ボトムシートモーダル → 12:00 を選択 → 保存
4. 既存の WakeRecord はそのまま保持（date は記録時点の値）
5. 新しいレコードは 12:00 境界で日付決定
6. 成立

### フロー3: 海外渡航シナリオ
1. 日本で dayBoundary=3 で使用
2. 渡航先で dayBoundary=12 に変更
3. 既存レコードは消えない（date は記録時点の値）
4. 新しいレコードは新 boundary で記録
5. 統計は alarmTriggeredAt ベースで表示可能
6. 成立

### フロー4: Daily Grade との連携
1. 目標睡眠時間 7h + アラーム 6:00 → 就寝目標 23:00
2. HealthKit が 22:50 就寝を検知
3. evaluateBedtime(22:50, 23, 0) → onTime
4. morningPass + onTime → excellent
5. 成立

### フロー5: 機能不全チェック — 曜日オーバーライド
1. デフォルト 6:00、土曜 8:00 のオーバーライドあり
2. 金曜夜に見ると SleepDurationCard は resolvedTime（次の日の値）から算出
3. 土曜のアラーム 8:00 - 7h = 01:00 就寝と表示
4. 正しい（resolvedTime が曜日ごとに変わる）

### フロー6: アラームOFF時
1. アラームが無効 → resolvedTime = null
2. SleepDurationCard は alarmTime=null を受け取る
3. calculateBedtime は呼ばれない → 就寝時刻なし
4. 睡眠時間の設定は保持されるが就寝時刻は非表示
5. 成立

### フロー7: レガシーデータマイグレーション
1. 旧バージョンのデータ: bedtimeTarget = { hour: 23, minute: 0 }
2. アプリ更新後、loadTarget が自動マイグレーション
3. targetSleepMinutes = 420 (7h) に変換
4. 次の永続化時に新フォーマットで保存
5. 成立
