# 起床タスクを「スクワット 10 回」に固定する

## Context

現状、ユーザーは起床時の TODO を自由テキスト＋スクワット追加で組み立てる設計（`app/(tabs)/index.tsx` の `TodoEditSection`、オンボーディングの `TodosStep`）になっている。
しかし「自分でタスクを設計するのが難しい」というフィードバックがあり、選択肢を 1 つに固定して "考えなくても始められる" 状態を作りたい。

固定するタスクは **「スクワット 10 回」**（既に `SquatChallengeItem` でセンサー検出による自動カウントまで実装済み）。回数は完全固定とする。

期待する振る舞い:
- 新規ユーザーは初期状態でスクワット 10 回が 1 件だけセットされている
- 既存ユーザーも次回起動時に「スクワット 10 回」1 件だけに置き換わる
- ダッシュボードからは TODO の追加・削除・並べ替え UI が消え、「明日のタスク: スクワット 10 回」の表示のみになる
- オンボーディングの TODO ステップは「スクワットを設定しました」の説明画面に置き換わる

## 方針

**データモデル (`WakeTarget.todos`) は配列のまま温存する。** セッション側 (`MorningSession.todos`) や `SquatChallengeItem` / Live Activity 同期 / 完了判定など、配列前提のロジックが多数あるため。
編集 API と UI のみを削ぎ落とし、「常に 1 件のスクワット TODO が入っている」不変条件を `DEFAULT_WAKE_TARGET` と `loadTarget` のマイグレーション経路で担保する。

## 変更箇所

### 1. データモデル: 固定 TODO を「契約」化

**`src/types/wake-target.ts`**
- `DEFAULT_WAKE_TARGET.todos` に固定スクワット TODO を 1 件入れる
- 固定 TODO 用の定数とビルダー関数を追加:
  ```ts
  /** 起床タスクは「スクワット10回」固定。UIでの編集機能は廃止済み。 */
  export const FIXED_SQUAT_TODO_TITLE = 'Squat';
  export const FIXED_SQUAT_REQUIRED_COUNT = 10;
  export function buildFixedSquatTodo(): TodoItem { ... }
  ```
- `id` は固定文字列（例: `'fixed-squat-todo'`）にする。`createTodoId()` を使うとマイグレーション時に毎回 ID が変わってしまい、進行中セッションとの突き合わせが壊れるリスクがある

**`src/types/alarm.ts`**
- `TodoItem` 型はそのまま（`type: 'squat'` / `requiredCount` は既存）

### 2. ストア: 編集 API を削除し、マイグレーションで固定化

**`src/stores/wake-target-store.ts`**
- `addTodo` / `addSquatTodo` / `removeTodo` / `reorderTodos` を削除
  - インターフェース (`WakeTargetState`) からも除去
- `migrateStoredTarget` で `todos` が空、または「固定スクワット TODO 1 件以外を含む」場合に `[buildFixedSquatTodo()]` で置き換える
  - 既存ユーザーが自由入力した TODO は破棄される（仕様の単純化を優先）
  - WHY コメントを追加: 「起床タスクは固定スクワット 1 件に統一する設計のため、永続化済みデータも次回ロード時に正規化する」
- `loadTarget` の "no stored data" 経路 (`fallback`) は `DEFAULT_WAKE_TARGET` 経由で自動的に固定 TODO が入る

### 3. ダッシュボード: 編集 UI を削除し、表示のみに

**`app/(tabs)/index.tsx`**
- `TodoEditSection` を「明日のタスク: スクワット 10 回」を表示するだけのシンプルなセクションに置き換え
  - `TextInput` / `addTodoButton` / `addSquatButton` / `todoDeleteButton` をすべて削除
  - 残すのは `commonStyles.section` 内の見出し + `todoBulletSquat` スタイルのバッジ + ラベル
- `DashboardScreen` 本体から不要になった state / ハンドラを削除:
  - `newTodoText` state、`addTodo` / `addSquatTodo` / `removeTodo` セレクタ
  - `handleAddTodo` / `handleAddSquatTodo` / `handleRemoveTodo`
- 関連スタイル (`addTodoRow` / `addTodoInput` / `addTodoButton` / `addTodoButtonText` / `addSquatButton` / `addSquatIcon` / `addSquatText` / `todoDeleteButton` / `todoDeleteText`) を削除
- `MorningRoutineSection`（セッション中のチェックリスト表示）はそのまま — 1 件のスクワット TODO を `SquatChallengeItem` で表示する既存パスがそのまま機能する

### 4. オンボーディング: TODO ステップを説明画面に置換

**`src/components/onboarding/TodosStep.tsx`**
- プリセット chip / `TextInput` / `todoList` をすべて削除
- 「スクワットを設定しました」「アラームが鳴ったらスクワット 10 回でしっかり目を覚ましましょう」といった説明と、戻る/次へボタンだけ残す
- props から `todos` / `setTodos` を削除（`onNext` / `onBack` のみ）
- スクワットアイコン (🏋️) を中央に大きく置くと意図が伝わりやすい

**`app/onboarding.tsx`**
- `todos` state と `setTodos` 受け渡しを削除
- `handleComplete` の `todoItems` 構築ロジックを削除し、`setTarget({ ...DEFAULT_WAKE_TARGET, defaultTime, enabled })` で固定 TODO を継承
- `<TodosStep onNext={handleNext} onBack={handleBack} />` に変更

### 5. i18n キーの整理

**`src/i18n/locales/{ja,en}/dashboard.json`**
- `todos` セクションを `{ title, fixedTaskLabel }` のような最小構成に絞る（`description` / `addTask` / `placeholder` / `empty` / `addSquat` を削除）
- 追加: `todos.fixedTaskLabel = "スクワット 10 回"` 相当

**`src/i18n/locales/{ja,en}/onboarding.json`**
- `todos.title` / `subtitle` を「スクワットを設定しました」系に書き換え
- `presets` / `addTask` / `placeholder` を削除

### 6. テスト更新

**`src/__tests__/wake-target-store.test.ts`**
- `addTodo and removeTodo` テスト (line 120) を削除
- `reorderTodos persists new order` テスト (line 139) を削除
- 新規テストを追加:
  - `loadTarget injects fixed squat todo when stored data has empty todos`
  - `loadTarget normalizes stored todos to fixed squat only`
  - `DEFAULT_WAKE_TARGET contains exactly one squat todo with requiredCount 10`

## 既存の活用ポイント

- `SquatChallengeItem` (`src/components/SquatChallengeItem.tsx`): スクワット検出 UI はそのまま流用
- `MorningSessionStore` の `incrementTodoCount` / `areAllCompleted` / `onAllTodosCompletedEffect`: 1 件 TODO 完了時のフロー（スヌーズ停止・WakeRecord 更新・Live Activity 反映）はそのまま機能する
- `migrateStoredTarget` (`wake-target-store.ts:63`): 既に `bedtimeTarget → targetSleepMinutes` のマイグレーション基盤があるので、`todos` 正規化もここに足せばパターンが揃う

## 注意点

- **進行中セッションとの整合**: `MorningSession.todos` は `WakeTarget.todos` を起床時にスナップショットしたものなので、固定化の影響はリセット時のみ。アクティブセッション中にロードしても既存セッションは破壊しない（store が分かれている）
- **既存テストへの波及**: `addTodo` / `removeTodo` / `reorderTodos` を呼ぶ他テストや E2E がないことは grep 確認済み（`src/__tests__/wake-target-store.test.ts` のみ）
- **ウィジェット同期**: `syncWidgetEffect` / `syncAlarmsEffect` は `target` 全体を見ているはずだが、TODO 編集系から `syncAfterTargetChange()` 呼び出しは元々していないので影響なし

## 検証手順

1. **静的チェック**
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm biome format .
   ```
2. **テスト**
   ```bash
   pnpm test
   ```
3. **手動確認**
   ```bash
   pnpm start && pnpm ios
   ```
   - 既存ユーザーシナリオ: AsyncStorage に旧 todos があってもロード後にスクワット 1 件だけになること
   - 新規ユーザーシナリオ: オンボーディング完走後にスクワット 1 件が入っていること
   - ダッシュボード: 編集 UI が消えていること、明日のタスクが「スクワット 10 回」と表示されること
   - 起床フロー: アラーム解除 → `SquatChallengeItem` でカウント → 10 回到達で完了になること
4. **プッシュ前 CI 検証** (`.claude/rules/pre-push-verification.md`)
   ```bash
   npx expo install --check
   pnpm changeset  # コード変更ありなので必須
   ```
