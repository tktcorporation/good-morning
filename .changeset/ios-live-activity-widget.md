---
"good-morning": minor
---

iOS の Live Activity とホーム画面ウィジェットを実装。これまで TS 側に呼び出しはあったがネイティブ実装が欠落しており、Live Activity は常に no-op（表示されない）状態だった。

- `@bacons/apple-targets` で Widget Extension ターゲット（`targets/widget/`）を新規作成
  - ホーム画面ウィジェット（systemSmall / systemMedium）: 次のアラーム時刻・起床ミッション進捗・連続記録を表示。App Groups 経由で `buildWidgetData()` のデータを読み取る
  - Live Activity（ロック画面 + Dynamic Island）: 起床ミッションの進捗と次スヌーズまでのカウントダウンを表示
- `expo-alarm-kit` のパッチに `startLiveActivity` / `updateLiveActivity` / `endLiveActivity` のネイティブ関数（ActivityKit）を追加。Live Activity の属性型 `GoodMorningWakeAttributes` を本体と Widget Extension で共有
- Widget Extension 署名用に `ios.appleTeamId`（`APPLE_TEAM_ID` 環境変数）を `app.config.ts` に追加

注: ネイティブ層の変更のため、実機（または iOS 26 対応 runner）でのビルド・動作確認が必要。
