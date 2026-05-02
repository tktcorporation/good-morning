---
---

CI/テスト基盤の追加強化。`@testing-library/react-native` を導入し、全画面ファイルを実際に render する smoke test を追加した。これにより、これまで `import smoke` と `bundle:check` では捕捉できなかった「初回レンダー時の同期 throw」「子コンポーネント import 副作用での throw」「useEffect 同期パスの throw」が CI で検知できるようになる。本番で Expo の errorRecoveryQueue 経由で SIGABRT に化ける起動直後クラッシュの一部の予防を狙ったもの。ユーザー向けの動作変更なし。

注: jest は `unhandledRejection` イベントをインターセプトするため、useEffect 内の fire-and-forget Promise rejection は本テストでは検知できない。本番のそのパスは Sentry 等のクラッシュレポーティング側で扱う。
