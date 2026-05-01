---
---

CI/テスト基盤の追加強化。`@testing-library/react-native` を導入し、画面ファイルを実際に render するスモークテストと、unhandled rejection を fail に昇格させる jest 設定を追加した。これにより、初回 render 時の throw に加えて、`useEffect` 内で起動された Promise チェーンの未捕捉エラー（本番で Expo の errorRecoveryQueue 経由で SIGABRT に化けるパス）も CI で検知できるようになった。ユーザー向けの動作変更なし。
