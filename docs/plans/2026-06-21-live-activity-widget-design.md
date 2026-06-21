# Live Activity / ホームウィジェット実装設計

## 背景

TS 側（`AlarmKitService.ts`, `WidgetSyncService.ts`, `session/*`）には Live Activity と
ウィジェットの呼び出しが揃っていたが、**ネイティブ実装が欠落**していた。

- `startLiveActivity` / `updateLiveActivity` / `endLiveActivity` が `expo-alarm-kit` に存在せず、
  `AlarmKitService` の `typeof fn !== 'function'` ガードにより**常に no-op（null 返却）**だった。
- Live Activity / ウィジェットを描画する **Widget Extension ターゲットがプロジェクトに存在しなかった**。
  `syncWidgetData` で App Groups にデータを書いても、読み取って表示する Extension が無かった。

このため Live Activity もホームウィジェットも一切表示されない状態だった。

## 実装

### Widget Extension（`targets/widget/`, @bacons/apple-targets）

| ファイル | 役割 |
|---|---|
| `expo-target.config.js` | Widget ターゲット定義（App Groups, frameworks, deploymentTarget 16.2） |
| `Attributes.swift` | Live Activity の属性 `GoodMorningWakeAttributes`（**本体と二重管理**） |
| `WidgetData.swift` | App Groups の `widget-data` JSON をデコード（`src/types/widget-data.ts` と一致） |
| `HomeWidget.swift` | ホーム画面ウィジェット（small/medium） |
| `LiveActivity.swift` | Live Activity UI（ロック画面 + Dynamic Island） |
| `WidgetBundle.swift` | `@main` エントリポイント |
| `Theme.swift` | 配色定数 |

### ネイティブ関数（`patches/expo-alarm-kit@0.1.6.patch`）

`startLiveActivity` / `updateLiveActivity` / `endLiveActivity` を ActivityKit で実装。
`GoodMorningWakeAttributes` / `LiveTodo` を本体側にも定義。

## 既知のリスク / 実機で確認すべき点

このリポジトリは Linux のため iOS ビルド検証ができない。実機（または iOS 26 対応の
CI runner）で以下を確認すること。

1. **ActivityAttributes のクロスモジュール型同一性（最重要）**
   `GoodMorningWakeAttributes` は本体（`ExpoAlarmKit` モジュール）と Widget Extension
   （別モジュール）で同一定義を二重管理している。ActivityKit は request 時の型と
   `ActivityConfiguration(for:)` の型を結び付けるため、もし実機で Live Activity が
   開始されるのにロック画面に表示されない場合は、型同一性が原因の可能性が高い。
   その場合は ActivityAttributes を共有フレームワーク化する等の対応を検討する。
   変更時は **必ず両ファイルを同時に更新**すること。

2. **`ios.appleTeamId`**
   Widget Extension の署名に必要。`APPLE_TEAM_ID` 環境変数で渡す。未設定だと
   実機ビルドの署名で失敗する（CI の Simulator ビルドは `CODE_SIGNING_ALLOWED=NO` で通る）。

3. **App Groups**
   `group.com.tktcorporation.goodmorning` を本体・Widget Extension の両方の
   provisioning profile に含める必要がある。

4. **prebuild**
   `npx expo prebuild -p ios --clean` で `targets/widget/` が Xcode にリンクされる。

## スコープ外

- **スヌーズ/アラーム音の選択**: アプリに音選択機能（設定）自体が無く、メインアラームも
  スヌーズも OS デフォルト音。`expo-alarm-kit` には `setSnoozeSoundName` があるが、
  渡す音源（ユーザー設定）が存在しないため今回は配線しない。音選択機能を追加する場合に
  別途対応する。
