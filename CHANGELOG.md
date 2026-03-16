# good-morning

## 1.1.1

### Patch Changes

- [#49](https://github.com/tktcorporation/good-morning/pull/49) [`f4127f6`](https://github.com/tktcorporation/good-morning/commit/f4127f6c63bd4aaa2ac810d4207a38cdbbe38930) Thanks [@tktcorporation](https://github.com/tktcorporation)! - fix: ネイティブスヌーズの postAlert 自動再発火を除去して連続鳴動を修正

  AlarmKit の countdownDuration(postAlert:) と secondaryButtonBehavior(.countdown) を
  除去し、各スヌーズを単発アラームに変更。postAlert を設定すると発火後に自動で
  再カウントダウン → 再発火するため、先行スケジュール済みの次のスヌーズと同時刻に
  鳴り、アラームが指数的に増殖していた。

## 1.1.0

### Minor Changes

- [#42](https://github.com/tktcorporation/good-morning/pull/42) [`96cb42c`](https://github.com/tktcorporation/good-morning/commit/96cb42c43a33296d5c5f8f20fb9abb7dfab19294) Thanks [@tktcorporation](https://github.com/tktcorporation)! - changeset 導入 + EAS リリースビルド統合

- [#46](https://github.com/tktcorporation/good-morning/pull/46) [`77134a2`](https://github.com/tktcorporation/good-morning/commit/77134a29d0b18e688698ac535579232ea161f472) Thanks [@tktcorporation](https://github.com/tktcorporation)! - セッションをアラーム発火から独立させ、時間ウィンドウベースに変更

  - MorningSession に windowEnd フィールドを追加し、セッションのライフサイクルをウィンドウで管理
  - session-lifecycle を大幅リファクタリング: ウィンドウベースの自動開始・期限切れ処理を追加
  - morning-session-store に startSession の windowEnd 引数を追加
  - expo-dev-client を 55.0.13 に更新（Expo SDK 互換性修正）
  - CLAUDE.md にプッシュ前 CI チェックリストを追加

- [#45](https://github.com/tktcorporation/good-morning/pull/45) [`6eddc22`](https://github.com/tktcorporation/good-morning/commit/6eddc22c4cf06217b4c8bc71cfc6cc6e7f645a86) Thanks [@tktcorporation](https://github.com/tktcorporation)! - alarm-kit リファクタリング + ネイティブ dismiss 時スヌーズスケジュール

### Patch Changes

- [#48](https://github.com/tktcorporation/good-morning/pull/48) [`3d0fe9c`](https://github.com/tktcorporation/good-morning/commit/3d0fe9c03e6ba4c442ddfb92028df38af150c542) Thanks [@tktcorporation](https://github.com/tktcorporation)! - fix: アラーム dismiss 後の再スケジュール漏れを修正 + TODO 未完了リマインド通知を追加
