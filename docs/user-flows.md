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

## 状態のライフサイクルまとめ

| 状態 | 作成タイミング | 破棄タイミング | 永続化 |
|------|--------------|--------------|--------|
| WakeTarget | 初回起動時 (DEFAULT) | 削除されない | AsyncStorage |
| WakeRecord | アラーム dismiss 時 | 削除されない | AsyncStorage |
| MorningSession | アラーム dismiss 時（TODO あり） | TODO 全完了時 | AsyncStorage |
| snoozeAlarmIds | アラーム dismiss 時（先行一括スケジュール） | セッションクリア時 | メモリのみ |
| snoozeFiresAt | アラーム dismiss 時 / スヌーズ発火時 | セッションクリア時 | メモリのみ |
| liveActivityId | Live Activity 開始時 | セッションクリア時 | AsyncStorage（session 内） |
