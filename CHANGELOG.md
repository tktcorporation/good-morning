# good-morning

## 1.2.2

### Patch Changes

- [#63](https://github.com/tktcorporation/good-morning/pull/63) [`9ae7b69`](https://github.com/tktcorporation/good-morning/commit/9ae7b6943dc67e359461b234aea4de85eba127c9) Thanks [@tktcorporation](https://github.com/tktcorporation)! - expo-dev-launcher@55.0.27 の appBridge リグレッションを回避するため 55.0.25 にピン留め

## 1.2.1

### Patch Changes

- [#58](https://github.com/tktcorporation/good-morning/pull/58) [`1d0e3da`](https://github.com/tktcorporation/good-morning/commit/1d0e3da4b9e98bff2a42974108274dcbce777fd5) Thanks [@tktcorporation](https://github.com/tktcorporation)! - fix: Expo パッケージを最新互換バージョンに更新し Swift コンパイルエラーを解消

## 1.2.0

### Minor Changes

- [#51](https://github.com/tktcorporation/good-morning/pull/51) [`4ddc9e8`](https://github.com/tktcorporation/good-morning/commit/4ddc9e8c980499cd6bed61431e8c1cd49f2781ee) Thanks [@tktcorporation](https://github.com/tktcorporation)! - Effect TS 導入 + Knip による未使用コード削除

  全サービス層を Effect (effect@3.20) で再構築し、副作用の依存関係とエラーを型レベルで追跡できるようにした。Knip で検出した未使用コード・エクスポートも削除。

- [#55](https://github.com/tktcorporation/good-morning/pull/55) [`921a425`](https://github.com/tktcorporation/good-morning/commit/921a425057ed6971fae8899e998f2aa9e2980068) Thanks [@tktcorporation](https://github.com/tktcorporation)! - カスタムアラーム音選択と全画面独自アラーム画面を削除し、AlarmKit に一本化

  - カスタムアラーム音選択 UI（設定画面）を削除
  - SoundService / alarm-sounds.ts / カスタム音声アセット（chime, birds, bell）を削除
  - WakeTarget から soundId フィールドを削除
  - AlarmKit のスケジュール API から soundName パラメータを削除（OS デフォルト音を使用）
  - 全画面アラーム画面（app/wakeup.tsx）を削除
  - アラーム dismiss 時は AlarmEventRouter でインライン処理（wakeup 画面を経由しない）
  - オンボーディングのデモステップからアラームデモ機能を削除

- [#57](https://github.com/tktcorporation/good-morning/pull/57) [`1b32e0f`](https://github.com/tktcorporation/good-morning/commit/1b32e0fbb9bd5fd10cf122be1133b1a21be9ed32) Thanks [@tktcorporation](https://github.com/tktcorporation)! - feat: スクワットチャレンジタスクを追加 — 加速度センサーでスクワット動作を検出し、起床確認タスクとして使用可能に

### Patch Changes

- [#54](https://github.com/tktcorporation/good-morning/pull/54) [`4cbad15`](https://github.com/tktcorporation/good-morning/commit/4cbad151457e06ddd90e6b79cd6096d04650002b) Thanks [@tktcorporation](https://github.com/tktcorporation)! - refactor: Effect TS サービスを src/services/ 直下に昇格し、レガシーサービスを削除

  - `src/services/effect/` ネストを解消し全 Effect サービスを `src/services/` 直下に配置
  - レガシーサービス（alarm-kit.ts, alarm-scheduler.ts, alarm-sync.ts, session-lifecycle.ts, live-activity.ts, todo-reminder.ts）を削除
  - compat.ts に initializeAlarmKit を追加し permissions.ts のレガシー依存を解消
  - テストを Effect 版サービスに移行（runEffect 経由でテスト）
  - jest.setup.js の expo-alarm-kit モックを全メソッド網羅に更新

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
