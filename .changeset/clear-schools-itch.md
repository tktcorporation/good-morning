---
---

ci/test 基盤の強化。Metro バンドル検証 (`pnpm bundle:check`) と画面ファイルの import / レンダースモークテストに加え、macOS runner 上で実機相当の **iOS 起動スモーク**（prebuild → pod install → Simulator ビルド → 起動 → クラッシュ判定）ワークフローを追加。これにより、未解決 import や JS レンダー時 throw だけでなく、Swift コンパイル失敗・dyld error・Expo Modules の Module 登録失敗といった native 層の起動直後クラッシュも CI で検知できるようになった。ユーザー向けの動作変更なし。
