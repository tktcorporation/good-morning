---
'good-morning': patch
---

固定スクワットタスクの title をレンダリング時にロケライズ。

固定 TODO の `title` は永続化時点で英語リテラル（`'Squat'`）固定だが、これを
そのまま render すると日本語ロケールでアクティブルーティンや day-review、
Live Activity、ホームウィジェットに英語が混在していた。

- `WakeTodoRecord` に `type?: TodoType` を追加し、履歴側でも種別判定可能に
- `getLocalizedTodoTitle()` ヘルパーを `src/utils/todo-display.ts` に追加し、
  `type === 'squat'` の時に i18n の `morningRoutine.squat.title` を引く
- `SquatChallengeItem` / `day-review` / `widget-data` / Live Activity 連携
  （`DismissService` / `RecoveryService` / dashboard の Live Activity 更新）
  すべてで適用
