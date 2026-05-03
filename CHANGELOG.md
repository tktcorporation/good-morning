# good-morning

## 1.4.0

### Minor Changes

- [#77](https://github.com/tktcorporation/good-morning/pull/77) [`495d028`](https://github.com/tktcorporation/good-morning/commit/495d0283e5f3d4050cf240eba2c3b3d6e64d3dfd) Thanks [@tktcorporation](https://github.com/tktcorporation)! - スクワット動作確認画面（設定 → スクワット動作確認）にリアルタイムなモーションデバッグセクションを追加。

  - 加速度センサー (x, y, z, magnitude)、ジャイロ、磁気、気圧計、Pedometer の現在値をライブ表示
  - スクワット判定ステートマシンの現在フェーズ・観測 magnitude の min/max・閾値を可視化（感度調整の参考用）
  - 歩数（モーション権限取得後の watchStepCount + 今日の累計）を表示
  - 利用不可なセンサーは "Unavailable" バッジで明示
  - 各センサー値は本番フローの `useSquatDetector` とは独立購読のため、本番ロジックには一切影響しない

  実装に伴って `useSquatDetector` から `nextSquatPhase` / `SquatPhase` / `SQUAT_THRESHOLDS` を export し、デバッグ画面と本番フローで判定ロジックを共有するよう変更。
  Pedometer のために iOS の `NSMotionUsageDescription` を `app.config.ts` に追加。

## 1.3.1

### Patch Changes

- [#73](https://github.com/tktcorporation/good-morning/pull/73) [`5e4d790`](https://github.com/tktcorporation/good-morning/commit/5e4d790d05b5a65888d9d55f66fe6157b638a01e) Thanks [@tktcorporation](https://github.com/tktcorporation)! - セキュリティ脆弱性のある依存関係を修正:

  - `babel-preset-expo` を 55.0.9 → 55.0.19 に更新
  - `@changesets/cli` を 2.30.0 → 2.31.0 に更新
  - `knip` を 5.88.1 → 6.11.0 に更新
  - 推移的依存関係の lockfile 内バージョンを範囲内で更新:
    - `minimatch` 3.1.2 → 3.1.5 (ReDoS 修正)
    - `node-forge` 1.3.3 → 1.4.0 (署名偽造・DoS 修正)
    - `@xmldom/xmldom` 0.8.11 → 0.8.13 (XML injection 修正)
    - `lodash` 4.17.23 → 4.18.1 (Code Injection / Prototype Pollution 修正)
    - `picomatch` 2.3.1 → 2.3.2, 4.0.3 → 4.0.4 (ReDoS / POSIX クラス修正)
    - `brace-expansion` 1.1.12 → 1.1.13, 5.0.2 → 5.0.5 (DoS 修正)
    - `yaml` 2.8.2 → 2.8.4 (Stack Overflow 修正)
    - `smol-toml` 1.6.0 → 1.6.1 (DoS 修正)

  残存する脆弱性 3 件は親パッケージのバージョン範囲指定により範囲内アップグレード不可能 (`@tootallnate/once`, `uuid@7.x` from `xcode`, `postcss@8.4.x` from `@expo/metro-config`)。これらは override や親パッケージ自体のメジャー更新なしには修正できない。

  加えて以下の通常依存も最新パッチ/マイナーへ更新:

  - `@biomejs/biome` 2.4.4 → 2.4.14 (biome.json schema URL も追従)
  - `effect` 3.20.0 → 3.21.2
  - `zustand` 5.0.11 → 5.0.12

  `@react-navigation/bottom-tabs` は Expo SDK 55 が要求する `@react-navigation/native@^7.1.33` との互換性維持のため 7.15.5 のまま据え置き (7.15.6+ は `^7.1.34` 以降を要求)。

## 1.3.0

### Minor Changes

- [#70](https://github.com/tktcorporation/good-morning/pull/70) [`937ecd2`](https://github.com/tktcorporation/good-morning/commit/937ecd22ddec4870083769887a1f60613bb2486d) Thanks [@tktcorporation](https://github.com/tktcorporation)! - 起床タスクを「スクワット 10 回」に固定。

  ユーザーが起床時の TODO を自分で組み立てる UI （ダッシュボードの自由入力 / スクワット追加 / 削除、オンボーディングのプリセット選択）を廃止し、起床タスクを「スクワット 10 回」1 件に固定した。「自分でタスクを設計するのは認知負荷が高い」というフィードバックに対応し、選択肢ゼロで朝を始められるようにする。

  - データモデル `WakeTarget.todos` の配列構造は維持（`MorningSession` / `SquatChallengeItem` / Live Activity 同期など配列前提のロジックを温存するため）
  - 既存ユーザーが永続化していた自由入力 TODO は次回ロード時に固定スクワット 1 件に正規化される（`migrateStoredTarget`）
  - store の編集 API (`addTodo` / `addSquatTodo` / `removeTodo` / `reorderTodos`) は削除
  - ダッシュボードは「明日のタスク: スクワット 10 回」の表示のみに、オンボーディングは説明画面に置換

- [#72](https://github.com/tktcorporation/good-morning/pull/72) [`2795ccf`](https://github.com/tktcorporation/good-morning/commit/2795ccf9d4140fd20aa7e37926655c075548be73) Thanks [@tktcorporation](https://github.com/tktcorporation)! - 設定画面に「スクワット動作確認」モードを追加。

  朝のアラーム解除フローと同じ `SquatChallengeItem`（および `useSquatDetector`）を使う動作確認画面を `app/squat-check.tsx` として追加し、設定画面からモーダル遷移で開けるようにした。端末・センサー・体格による検出感度の差を、本番フローを発火させずに事前に確認できる。

  - 検出ロジックはアラーム本番と完全に共通（コンポーネント・フック・閾値・デバウンスを再利用）
  - 動作確認用の `SessionTodo` はローカル state のみ。永続化・通知・グレード集計には影響しない
  - リセットボタンで何度でも試せる

### Patch Changes

- [#70](https://github.com/tktcorporation/good-morning/pull/70) [`a38404d`](https://github.com/tktcorporation/good-morning/commit/a38404d1ba8a8fb8c60f136ffbe251beaf2bfc4d) Thanks [@tktcorporation](https://github.com/tktcorporation)! - 固定スクワットタスクの title をレンダリング時にロケライズ。

  固定 TODO の `title` は永続化時点で英語リテラル（`'Squat'`）固定だが、これを
  そのまま render すると日本語ロケールでアクティブルーティンや day-review、
  Live Activity、ホームウィジェットに英語が混在していた。

  - `WakeTodoRecord` に `type?: TodoType` を追加し、履歴側でも種別判定可能に
  - `getLocalizedTodoTitle()` ヘルパーを `src/utils/todo-display.ts` に追加し、
    `type === 'squat'` の時に i18n の `morningRoutine.squat.title` を引く
  - `SquatChallengeItem` / `day-review` / `widget-data` / Live Activity 連携
    （`DismissService` / `RecoveryService` / dashboard の Live Activity 更新）
    すべてで適用

## 1.2.3

### Patch Changes

- [#68](https://github.com/tktcorporation/good-morning/pull/68) [`1c96a7a`](https://github.com/tktcorporation/good-morning/commit/1c96a7aded61d5d989385f499f52c887a7d9ba5a) Thanks [@tktcorporation](https://github.com/tktcorporation)! - iOS 起動時の `useFrameSize must be used within a FrameSizeProvider` クラッシュを修正。`@react-navigation/bottom-tabs` を expo-router が引き込むバージョン (7.15.5) に揃えることで、`@react-navigation/elements` の重複インストール（2.9.8 と 2.9.10 が共存）を解消し、`FrameSizeProvider` と `useFrameSize` が同じ React Context を参照するようにした。

  合わせて、Provider 系ライブラリの重複を CI で検知するテスト (`src/__tests__/no-duplicate-providers.test.ts`) を追加。

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
