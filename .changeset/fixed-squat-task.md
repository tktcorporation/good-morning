---
'good-morning': minor
---

起床タスクを「スクワット 10 回」に固定。

ユーザーが起床時の TODO を自分で組み立てる UI （ダッシュボードの自由入力 / スクワット追加 / 削除、オンボーディングのプリセット選択）を廃止し、起床タスクを「スクワット 10 回」1 件に固定した。「自分でタスクを設計するのは認知負荷が高い」というフィードバックに対応し、選択肢ゼロで朝を始められるようにする。

- データモデル `WakeTarget.todos` の配列構造は維持（`MorningSession` / `SquatChallengeItem` / Live Activity 同期など配列前提のロジックを温存するため）
- 既存ユーザーが永続化していた自由入力 TODO は次回ロード時に固定スクワット 1 件に正規化される（`migrateStoredTarget`）
- store の編集 API (`addTodo` / `addSquatTodo` / `removeTodo` / `reorderTodos`) は削除
- ダッシュボードは「明日のタスク: スクワット 10 回」の表示のみに、オンボーディングは説明画面に置換
