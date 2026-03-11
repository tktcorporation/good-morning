---
"good-morning": minor
---

セッションをアラーム発火から独立させ、時間ウィンドウベースに変更

- MorningSession に windowEnd フィールドを追加し、セッションのライフサイクルをウィンドウで管理
- session-lifecycle を大幅リファクタリング: ウィンドウベースの自動開始・期限切れ処理を追加
- morning-session-store に startSession の windowEnd 引数を追加
- expo-dev-client を 55.0.13 に更新（Expo SDK 互換性修正）
- CLAUDE.md にプッシュ前 CI チェックリストを追加
