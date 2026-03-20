---
'good-morning': patch
---

refactor: Effect TS サービスを src/services/ 直下に昇格し、レガシーサービスを削除

- `src/services/effect/` ネストを解消し全 Effect サービスを `src/services/` 直下に配置
- レガシーサービス（alarm-kit.ts, alarm-scheduler.ts, alarm-sync.ts, session-lifecycle.ts, live-activity.ts, todo-reminder.ts）を削除
- compat.ts に initializeAlarmKit を追加し permissions.ts のレガシー依存を解消
- テストを Effect 版サービスに移行（runEffect 経由でテスト）
- jest.setup.js の expo-alarm-kit モックを全メソッド網羅に更新
