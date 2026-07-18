# design-sync NOTES

## リポジトリ固有の設定

- `shape: "package"`（Storybook なし、synth-entry モード）。`srcDir: "src/components"`。
- Web プレビュー用のスクラッチ node_modules を `.design-sync/.cache/web-nm/node_modules` に構築。
  `react-native` は `react-native-web` へのエイリアスインストール（`npm i react-native@npm:react-native-web@x`）。
  ネイティブ専用パッケージ（expo-router / expo-sensors / expo-localization(ja固定) /
  expo-notifications / expo-task-manager / expo-background-fetch / expo-alarm-kit /
  @kingstinct/react-native-healthkit）は手書きの no-op/DOM マッピングスタブ。
  react-native-svg は実 DOM `<svg>` 要素にマッピングするスタブ。
- `.design-sync/node_modules/*` はこのスクラッチ node_modules へのシンボリックリンク
  （`.design-sync/previews/*.tsx` を esbuild が解決する際、リポジトリ本物の
  `node_modules/react-native`（Flow構文で esbuild が壊れる）より先にこちらが解決されるようにするため）。
  クローン直後は再作成が必要 — `.gitignore` 済み。
- `extraEntries` に `theme.ts` / `i18n/index.ts` に加え、`settings-store.ts` /
  `morning-session-store.ts` の Zustand ストアを追加している。理由は下記「ストアを読むコンポーネントのプレビュー」参照。

## ストアを読むコンポーネントのプレビュー(重要・再発防止)

`SleepCard` / `SleepDetailSection`(`useSettingsStore`)、`MorningRoutineBanner`
(`useMorningSessionStore`)は props ではなく Zustand ストアを直接購読するため、
デフォルト値(`healthKitEnabled: false` / `session: null`)のままだと空 or null 表示になる。

**動かない方法**: プレビュー側で相対パス import
(`import { useSettingsStore } from '../../src/stores/settings-store'`)して
`setState()` する — esbuild のビルドが「コンポーネント本体(`_ds_bundle.js`)」と
「プレビュー自身(`_preview/<Name>.js`)」で **別々** のため、同じ絶対パスでも
別インスタンスの Zustand ストアになり、`setState` は本体側に届かない。

**動く方法**: 対象のストアファイルを `cfg.extraEntries` に追加して
`_ds_bundle.js` の同一ビルドに含め、プレビュー側は
`import { useSettingsStore } from 'good-morning';`(パッケージ経由のベア import)
でストアを取得する。これで本体とプレビューが同一インスタンスを共有する。

他にストアを直接読むコンポーネントを追加する場合は同じパターンを踏むこと。

**既知の副作用**: `MorningRoutineBanner` はグリッド(複数ストーリー同時表示)モードだと、
共有ストアの `setState` が最後に mount したストーリーの値で全セルに反映されてしまい
"variants render identically" 警告が出る(`?story=` 個別キャプチャは各ページロードが
独立しているため問題なし)。`cfg.overrides.MorningRoutineBanner.cardMode: "single"` で
グリッド表示自体を1カード化して回避済み。他のストア購読コンポーネントを複数ストーリーで
グリッド表示したい場合、同様の trade-off に注意。

## package-validate.mjs の既知バグ(ローカルパッチ済み・再同期で消える)

`.ds-sync/package-validate.mjs` の rootEmpty 判定
(`document.querySelectorAll('#root, [id^="r"]')`)が、react-native-web が
`<head>` に注入する `<style id="react-native-stylesheet">`(CSSOM 経由で
ルールを挿入するため `.innerHTML` は空)を `roots[0]` として誤検出し、
実際にはレンダリングできている全コンポーネントを `[RENDER] root empty` と
誤判定するバグを踏んだ。`div[id^="r"]` に絞るローカルパッチで回避
(`.ds-sync/` はコピー・gitignore 対象なので再同期時に元のスクリプトへ
戻る — 次回このバグを踏んだら同じ修正を再適用すること。該当箇所は
`package-validate.mjs` の render-check `page.evaluate` 内、
`const roots = document.querySelectorAll(...)` の行)。

## Known render warns(トリアージ済み・無視してよい)

- `SleepDurationPickerModal`(`cardMode: "single"` 適用後）: `[RENDER_THIN]`
  「rendered height is 0px」— Modal はポータルで body 直下に描画されるため、
  single モードのラッパー計測がポータルの実位置を捉えられないだけの計測アーティファクト。
  スクリーンショット(`_screenshots/review/general__SleepDurationPickerModal.png`)で
  実際は正しくオーバーレイ表示されていることを目視確認済み。

## Re-sync risks

- `.design-sync/.cache/web-nm/node_modules` のスクラッチパッケージ群は完全にローカル環境の
  ものなので、別マシンでの再同期時は本 NOTES の手順に従い作り直す必要がある
  (`npm i react@19.2.0 react-dom@19.2.0 react-native@npm:react-native-web@0.21.2
  react-i18next i18next zustand effect @react-native-async-storage/async-storage
  --legacy-peer-deps` + 手書きスタブ一式)。
- `package-validate.mjs` のローカルパッチは `.ds-sync/` 再コピー時に失われる
  (上記「既知バグ」参照)。
- `SquatChallengeItem` の「検出中」状態は `useSquatDetector` が mount 時に
  同期的に `isListening: true` にする実装のため props だけで再現できているが、
  実センサー挙動と厳密には異なる(スタブが常に「検出中」を返す動作依存)。
  ソース側の実装が変わった場合はプレビューの再検証が必要。
- `PermissionStep` の granted/denied 状態は内部 `useState` を
  `onPress` ハンドラ内でのみ遷移させるため、静的プレビューからは到達不能
  (props 注入経路なし)。将来的にプレビューで見せたい場合はコンポーネント側に
  status を外部注入できる prop を足す必要がある。
