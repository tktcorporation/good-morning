# good-morning

## 1.5.0

### Minor Changes

- [#100](https://github.com/tktcorporation/good-morning/pull/100) [`b10ea1f`](https://github.com/tktcorporation/good-morning/commit/b10ea1f7b4be01c97abac14d7e69217acf45381f) Thanks [@tktcorporation](https://github.com/tktcorporation)! - アラーム後の起床フロー中でも、起床タスクの種類（スクワット / 空の写真）を切り替えられるようにした

  - ホーム画面のセッション中表示に、タスク種別を切り替えるボタンを追加。切り替えると進行中の進捗が失われるため確認ダイアログを表示する
  - 設定画面からの切り替えは引き続き次回以降のデフォルトのみを変更する。進行中セッションのタスクを変えたい場合はホーム画面から切り替える旨を案内文言で明示した

- [#100](https://github.com/tktcorporation/good-morning/pull/100) [`b10ea1f`](https://github.com/tktcorporation/good-morning/commit/b10ea1f7b4be01c97abac14d7e69217acf45381f) Thanks [@tktcorporation](https://github.com/tktcorporation)! - 起床タスクに「空の写真」を追加し、スクワットと並ぶ選択肢として設定画面から切り替えられるようにした

  - 空判定は端末上の Vision framework（VNClassifyImageRequest）による画像分類のみで行い、
    撮影した写真は端末外に送信・保存しない。ローカル Expo Module `modules/expo-sky-vision` として実装
  - 設定画面に起床タスクの種類（スクワット / 空の写真）を切り替えるセクションを追加
  - `expo-camera` を依存に追加し、`NSCameraUsageDescription` を設定

### Patch Changes

- [#92](https://github.com/tktcorporation/good-morning/pull/92) [`940274d`](https://github.com/tktcorporation/good-morning/commit/940274dd5d930bb0bb47bd27773d97b18bb74a1d) Thanks [@tktcorporation](https://github.com/tktcorporation)! - アラームが設定時刻に鳴らない問題を修正し、スケジューリングの回帰テストを整備

  - launch payload の consume-once 二重読みにより、アラーム経由の cold-start で dismiss 処理・スヌーズ到着処理が実行されなかった問題を修正
  - アラーム登録が「先キャンセル → 後スケジュール」だったため、ネイティブの一時的な失敗 1 回でアラームが 0 本になる問題を修正（先スケジュール + 失敗時ロールバックで旧アラームを温存）
  - アラーム同期の並行実行で登録済みアラームが孤立扱いで取り消される競合を Semaphore 直列化で修正
  - 「明日だけ変更」が当日を対象日にしてしまい、翌日に鳴らない問題を修正（論理翌日を対象に）
  - レガシー・破損した保存データ（dayOverrides / nextOverride 欠落等）でスケジューリング全体が例外死する問題を正規化で修正
  - dismiss イベントの取りこぼし（ストア未ロード時の破棄・自動開始セッションとの誤判定）と、ネイティブ先行スヌーズが孤立キャンセルで消える問題を修正
  - セッション自動開始がストア未ロード時に進行中セッション・完了済みレコードを見誤り上書きする問題を修正
  - 深夜 0 時をまたぐ「明日だけ変更」で、日付が変わる直前のセッションウィンドウ前半を見失う問題を修正
  - 「明日だけ変更」画面が、日付変更ラインより前の深夜に開くと保存先と異なる曜日の予定時刻を表示する問題を修正
  - 起床設定データが破損した場合にダッシュボードがローディング画面に固まり続け、修復手段がない問題を修正（リセット導線を追加）
  - settings ストア未ロード時に、有効な永続化済みセッションを誤って別日と判定し破棄してしまう問題、および誤った設定でセッションを自動開始してしまう問題を修正
  - 深夜 0 時をまたぐ「明日だけ変更」で、直前の通常アラームの dismiss 記録が override 対象日に紐づき、実際の override dismiss が重複と誤判定されて記録されなくなる問題を修正
  - 二重鳴動を許容する設計（override 対象日でも通常アラームが維持される）で、同日 2 回目の dismiss が既存の WakeRecord（TODO 進捗・完了状態）を上書きしてしまう問題を修正
  - records ストア未ロード時に期限切れセッションのクリーンアップが空の起床履歴を永続化し、既存の記録を消してしまう問題を修正
  - 深夜に近い時刻の「明日だけ変更」で、dismiss が日付をまたいだ直後に行われると WakeRecord が翌日の通常アラーム基準で誤計算される問題を修正
  - override と通常アラームが近接する時刻設定で、まだ発火していないアラームの時刻が dismiss 記録に誤って採用されてしまう問題を修正
  - アプリを開かないまま複数の朝にわたってアラームを dismiss した場合、最後の 1 件しか WakeRecord にならず、それ以前の日の起床記録が失われる問題を修正
  - records ストア未ロード時に expireSessionIfNeeded の保留を「期限切れでない」と誤解釈し、WakeRecord 未更新のままセッションを stale 破棄してしまう問題を修正
  - 深夜 0 時をまたいで override が採用された dismiss で、goalDeadline が dismiss 日基準で計算され 1 日ズレる問題を修正
  - 複数の未処理 dismiss イベントを遡って処理する際、古いイベントでもセッション・スヌーズが開始され、最新イベントのスヌーズが古い日付のセッションに誤って紐づく問題を修正（セッション・スヌーズの取り込みは最新イベントのみに限定）
  - ダッシュボードとホームウィジェットの「次のアラーム」表示が、暦日ベースの計算のため dayBoundaryHour 前の深夜や、今日のアラームを消化した後の「明日だけ変更」を正しく反映しない問題を修正
  - 二重鳴動を許容する設計で同一論理日付に複数の primary dismiss イベントが積まれた場合、最新イベントが古いイベントとの同日重複と誤判定され、WakeRecord はあるのにセッション・スヌーズが開始されない問題を修正
  - dayBoundaryHour がアラーム時刻より後の設定で、発火後〜境界通過前は次のアラーム表示が既に過ぎた時刻に戻ってしまう問題を修正
  - dismiss 時刻の解決ロジックを絶対時刻ベースの候補比較に刷新し、前日深夜の通常アラームと当日早朝の override が近接する設定で、前日の通常アラーム dismiss を見落とす問題を修正
  - 二重鳴動を許容する設計で、次のアラーム表示（ダッシュボード・ウィジェット）が override 対象日の通常アラームを考慮せず、まだ発火していないアラームを見逃したり誤って報告したりする問題を修正
  - 自動開始セッション（recordId 未確定）中にスヌーズが届いた場合、未消化の dismiss イベントが復元されずネイティブスヌーズが孤立キャンセルされる問題を修正
  - 次のアラーム表示が翌日 1 日分しか探索しないため、翌日が OFF 設定で他の曜日にまだ有効なアラームがある場合に「次のアラームなし」と誤って報告する問題を修正
  - 日付変更直後（暦日は override 対象日に入っているが、実際に鳴ったのは前夜の通常アラーム）の dismiss で、記録日が override 対象日に誤って紐づき、後続の実際の override dismiss が同日重複と誤判定されて記録されなくなる問題を修正
  - dayBoundaryHour がアラーム時刻より後の設定で、境界通過前に「明日だけ変更」画面を開くとピッカーの表示（今日の曜日設定）と実際の保存先（1 日先送りされた override 対象日）がズレる問題を修正
  - 起床履歴・セッションストアの読み込みが失敗すると loaded フラグが永久に立たず、以降アラーム無効化・時刻変更・「明日だけ変更」保存などの明示的な操作をしてもネイティブアラーム同期が二度と走らなくなる問題を修正。読み取り自体の一時的な失敗はリトライで復旧し、リトライしても読み取れない場合は空データで確定させず（実データの上書き消失を防ぐため）loaded=false のまま保持するようにした
  - 二重鳴動を許容する設計で、override 対象日でもまだ発火していない通常アラームのウィンドウ内でセッションの自動開始判定が override 時刻優先で見落とされ、実際のアラーム発火時にセッションが開始されない問題を修正
  - 前夜の通常アラームが既に発火してアフターウィンドウ内（有効中）でも、近接する翌暦日の未発火 override の方が分差で近いというだけでセッションの自動開始判定が override 側に奪われてしまう問題を修正
  - 「明日だけ変更」画面で、dayBoundaryHour がアラーム時刻より後の設定で境界通過前にピッカーが翌日を表示している状態からユーザーが時刻を初期値から変更すると、保存時に対象日が独立して再計算され、表示していた翌日ではなく当日（数十分後）の override として保存されてしまう問題を修正
  - ダッシュボードの「次に迎える朝」表示が、dayBoundaryHour がアラーム時刻より後の設定で境界通過前は暦日ベースのまま今日に戻ってしまい、「明日だけ変更」画面（resolveOverrideEditDay で正しく翌日に補正済み）と異なる日の予定を表示していた問題を修正
  - 二重鳴動を許容する設計で、override 対象日と暦日が一致しただけで、前夜の通常アラームセッション（windowEnd 前でまだ有効中）を別日の stale セッションと誤判定して TODO 進捗ごと破棄してしまう問題を修正
  - 同日 override と通常アラームのウィンドウが重なる場合、セッション自動開始の候補選択が配列の並び順で最初に一致したものを返していたため、まだ発火していない候補を誤って選び、実際に発火したアラームの期限切れ・スヌーズ処理が遅れる問題を修正
  - 起動時に settings の読み込みが失敗すると、未回収の dismiss イベントが確保するはずのネイティブ先行スヌーズを syncAlarmsEffect が孤立とみなしてキャンセルしてしまう問題を修正。settings ストアの読み込みにも records/session ストアと同じ読み取りリトライ + 安全なデフォルト値のパターンを適用し、syncAlarmsEffect のガードに settings ロード状態を追加した

- [#98](https://github.com/tktcorporation/good-morning/pull/98) [`9645362`](https://github.com/tktcorporation/good-morning/commit/964536253fc890c16190fc3039fd894f4274cca9) Thanks [@tktcorporation](https://github.com/tktcorporation)! - ストア永続化を Effect の StorageService に統一し、データ破損時の安定性を強化

  - daily-grade ストアの読み込みで grades/streak の JSON が破損しているとロード処理全体が例外を投げていた問題を修正（他ストアと同様、破損データはデフォルト値にフォールバックする）
  - wake-target ストアの読み込みに読み取りリトライが無く、ストレージの一時的な読み取り失敗が未処理のまま伝播していた問題を修正
  - 全 5 ストア（settings / wake-target / wake-record / morning-session / daily-grade）の永続化を、型付きエラー・統一されたリトライ・JSON パース保護を持つ Effect の StorageService 経由に統一（従来は個別に AsyncStorage を直接操作しており、リトライ適用や失敗処理が不統一だった）
  - settings / morning-session / daily-grade（streak）はスキーマ検証を追加し、型が一致しない永続化データをデータ破損として安全にデフォルト値へフォールバックするようにした

- [#98](https://github.com/tktcorporation/good-morning/pull/98) [`9645362`](https://github.com/tktcorporation/good-morning/commit/964536253fc890c16190fc3039fd894f4274cca9) Thanks [@tktcorporation](https://github.com/tktcorporation)! - Schema 検証の一括デコードにより永続化データの正常なフィールドが巻き添えで失われる問題を修正

  - settings / daily-grade（streak）/ wake-record / morning-session の永続化データデコードを、
    Schema.Struct による一括デコードからフィールド単位のデコードに変更。従来は 1 フィールドの
    型不一致だけでオブジェクト全体のデコードが失敗し、他の正常なフィールド（AlarmKit 権限許可
    状態・ストリーク実績・起床履歴・進行中セッションのスヌーズ状態等）までデフォルト値に
    巻き添えで上書きされていた
  - wake-record の永続化スキーマが必須フィールドを厳格に要求していたため、後から追加された
    フィールドを持たない過去データが要素ごと静かに破棄されうる問題を修正（id/date/result 以外は
    フィールド単位でデフォルト補完するよう変更）
  - morning-session の読み込みで、破損した startedAt から windowEnd を計算する際に
    RangeError が発生すると StorageDecodeError の捕捉から漏れ、データ破損時と異なる
    エラー経路（ロード状態が復旧不能になる）を辿っていた問題を修正
  - daily-grade の grades 配列読み込みが要素単位の形状検証をしていなかった問題を修正
    （wake-record と同じレコード単位検証パターンに統一）

- [#86](https://github.com/tktcorporation/good-morning/pull/86) [`1077c62`](https://github.com/tktcorporation/good-morning/commit/1077c6229d6bf5ce663bfea9239167a91f26547a) Thanks [@tktcorporation](https://github.com/tktcorporation)! - 依存パッケージのセキュリティ更新: shell-quote (critical) / ws / form-data / @xmldom/xmldom / uuid / js-yaml / brace-expansion / @tootallnate/once / @babel/core を修正版へ更新し、@expo/dom-webview を 55.0.6 へ更新

## 1.4.1

### Patch Changes

- [#84](https://github.com/tktcorporation/good-morning/pull/84) [`18e65fe`](https://github.com/tktcorporation/good-morning/commit/18e65fe785b43035e8607aa165c822336cd6db53) Thanks [@tktcorporation](https://github.com/tktcorporation)! - refactor: SSOT 化・重複ロジックの集約・型の厳密化（挙動は不変）

  - 永続化キー / 時刻定数（分・日・ミリ秒）/ スヌーズ・リマインドのケイデンス / グレード色を単一定義に集約（`constants/storage-keys`・`constants/time`・`constants/alarm-timing`、grade 色は `grade-symbols` を SSOT に統一）
  - YYYY-MM-DD 整形・深夜跨ぎの分差補正・起床成功判定・セッション TODO 変換・睡眠表示フォーマッタの重複実装を共通化
  - `WidgetData.lastGrade` / 通知エラー operation / 権限 i18n キーの型を厳密化し、`as never` と偽リテラルキャストを除去
  - 抽出した純粋関数の単体テストを追加（既存テストは全て緑のまま）

- [#82](https://github.com/tktcorporation/good-morning/pull/82) [`554a8a3`](https://github.com/tktcorporation/good-morning/commit/554a8a3bcdbc09f0d4a371f82d766f58f239e25f) Thanks [@tktcorporation](https://github.com/tktcorporation)! - chore: ziku pull でテンプレート(tktcorporation/.github)を最新へ同期し、Expo 依存を SDK 55 推奨バージョンへ更新。

  - 共有開発環境設定（hooks/rules/skills/settings/devcontainer/mise）をテンプレート最新へ同期
  - `npx expo install --fix` で Expo 関連 13 パッケージをパッチ更新し、`expo install --check`（CI: Expo Doctor）を解消
  - PR セルフレビュー hook が書き込む `.claude/.pr-review-count` を `.gitignore` に追加

## 1.4.0

### Minor Changes

- [#81](https://github.com/tktcorporation/good-morning/pull/81) [`8ae8947`](https://github.com/tktcorporation/good-morning/commit/8ae8947bd33952007bc21134e9f16e0f29291f31) Thanks [@tktcorporation](https://github.com/tktcorporation)! - iOS の Live Activity とホーム画面ウィジェットを実装。これまで TS 側に呼び出しはあったがネイティブ実装が欠落しており、Live Activity は常に no-op（表示されない）状態だった。

  - `@bacons/apple-targets` で Widget Extension ターゲット（`targets/widget/`）を新規作成
    - ホーム画面ウィジェット（systemSmall / systemMedium）: 次のアラーム時刻・起床ミッション進捗・連続記録を表示。App Groups 経由で `buildWidgetData()` のデータを読み取る
    - Live Activity（ロック画面 + Dynamic Island）: 起床ミッションの進捗と次スヌーズまでのカウントダウンを表示
  - `expo-alarm-kit` のパッチに `startLiveActivity` / `updateLiveActivity` / `endLiveActivity` のネイティブ関数（ActivityKit）を追加。Live Activity の属性型 `GoodMorningWakeAttributes` を本体と Widget Extension で共有
  - Widget Extension 署名用に `ios.appleTeamId`（`APPLE_TEAM_ID` 環境変数）を `app.config.ts` に追加

  注: ネイティブ層の変更のため、実機（または iOS 26 対応 runner）でのビルド・動作確認が必要。

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
