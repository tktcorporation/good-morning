---
"good-morning": patch
---

chore: ziku pull でテンプレート(tktcorporation/.github)を最新へ同期し、Expo 依存を SDK 55 推奨バージョンへ更新。

- 共有開発環境設定（hooks/rules/skills/settings/devcontainer/mise）をテンプレート最新へ同期
- `npx expo install --fix` で Expo 関連13パッケージをパッチ更新し、`expo install --check`（CI: Expo Doctor）を解消
