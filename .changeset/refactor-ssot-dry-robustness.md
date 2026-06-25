---
"good-morning": patch
---

refactor: SSOT 化・重複ロジックの集約・型の厳密化（挙動は不変）

- 永続化キー / 時刻定数（分・日・ミリ秒）/ スヌーズ・リマインドのケイデンス / グレード色を単一定義に集約（`constants/storage-keys`・`constants/time`・`constants/alarm-timing`、grade 色は `grade-symbols` を SSOT に統一）
- YYYY-MM-DD 整形・深夜跨ぎの分差補正・起床成功判定・セッション TODO 変換・睡眠表示フォーマッタの重複実装を共通化
- `WidgetData.lastGrade` / 通知エラー operation / 権限 i18n キーの型を厳密化し、`as never` と偽リテラルキャストを除去
- 抽出した純粋関数の単体テストを追加（既存テストは全て緑のまま）
