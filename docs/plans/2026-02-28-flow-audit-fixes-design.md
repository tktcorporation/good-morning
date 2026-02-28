# フロー監査で発見した問題の修正設計

フロー調査（2026-02-28）で発見した16件の問題 + デッドコード削除の修正設計。

## 方針

- **A1**: スヌーズキャンセルは `cancelAllAlarms()` + 通常アラーム再スケジュール方式（snoozeAlarmIds の永続化は不要）
- **B1**: WakeRecord の防御的プログラミング（日付重複チェック、dismiss ガード、エラー通知）
- **C1**: ドキュメント更新・デッドコード削除を一括実施

## グループA: スヌーズ・セッションのライフサイクル修正

### H1: TODO全完了時のスヌーズキャンセル修正

**ファイル**: `app/(tabs)/index.tsx` completion effect (L122-160)

`cancelSnoozeAlarms(snoozeIds)` → `cancelAllAlarms()` に変更。その後 `scheduleWakeTargetAlarm(target)` で通常アラームを再スケジュール。snoozeAlarmIds が空（アプリ再起動後）でも確実に全スヌーズがキャンセルされる。

### M3 + M5: 期限切れセッションのクリーンアップ

**ファイル**: `app/_layout.tsx` 初期化 effect

通常起動時に `session.date` が今日の論理日付と異なる場合、古いセッションをクリーンアップ:
1. Live Activity 終了
2. `clearSession()`

アラーム起動時（wakeup 遷移前）にも同じチェックを入れる。

### M4: 設定変更時のスヌーズ保護

**ファイル**: `app/_layout.tsx` target effect (L138-150)

アクティブセッション中は target 変更によるアラーム再スケジュールをスキップ。セッション完了後の completion effect で再スケジュールされる。

### L4: snoozeFiresAt 消失

対応不要。先行スケジュール方式の制約として許容。次のスヌーズ発火で `handleSnoozeArrival()` が再設定する。

### L5: completion effect の順序

ドキュメントを実装に合わせて更新（fire-and-forget の並行実行は実質問題なし）。

## グループB: WakeRecord の堅牢性

### H2: HealthKit 睡眠データ取得

ドキュメントを実装に合わせて更新。`useDailySummary` がダッシュボード表示時に HealthKit データを同期済みのため、dismiss 時の取得は不要。

### H3: アラーム未dismiss の明示的処理

**ファイル**: `src/hooks/useGradeFinalization.ts`

`useGradeFinalization` 内で、アラームが有効だった日に WakeRecord がない場合を明示的に `morningPass: false` として処理。WakeRecord は作成しない（「WakeRecord なし = dismiss されなかった」として推論）。

### M1: addRecord 失敗時のエラーハンドリング

**ファイル**: `app/wakeup.tsx`

catch ブロックで `Alert.alert()` を表示し、ユーザーにフィードバック。

### M2: 同日の WakeRecord 重複防止

**ファイル**: `src/stores/wake-record-store.ts`

`addRecord` に日付重複チェックを追加。同日のレコードが既にある場合は上書き更新。

### L2: 2回連続dismiss防止

**ファイル**: `app/wakeup.tsx`

`handleDismiss` に処理中フラグ (`dismissing` state) を追加。

## グループC: ドキュメント・デッドコード・エッジケース

### L1: ドキュメントの関数名不一致

**ファイル**: `docs/user-flows.md`

`handleSnoozeRefire()` → `handleSnoozeArrival()` に更新。

### L3: loadTarget 完了前のフォールバック表示

**ファイル**: `app/wakeup.tsx`

フォールバック UI のテキストをエラーメッセージからローディング表示に変更。

### L6: dayBoundaryHour 変更時の整合性

対応不要。変更は極めて稀で、マイグレーションの実装コストに見合わない。

### デッドコード削除

**ファイル**: `src/stores/wake-target-store.ts`, `src/__tests__/wake-target-store.test.ts`

`toggleTodoCompleted()`, `resetTodos()`, `areAllTodosCompleted()` を削除。アプリコードからの呼び出しなし。`MorningSession.toggleTodo` が完全にこの役割を担っている。
