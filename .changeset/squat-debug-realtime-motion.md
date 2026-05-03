---
"good-morning": minor
---

スクワット動作確認画面（設定 → スクワット動作確認）にリアルタイムなモーションデバッグセクションを追加。

- 加速度センサー (x, y, z, magnitude)、ジャイロ、磁気、気圧計、Pedometer の現在値をライブ表示
- スクワット判定ステートマシンの現在フェーズ・観測 magnitude の min/max・閾値を可視化（感度調整の参考用）
- 歩数（モーション権限取得後の watchStepCount + 今日の累計）を表示
- 利用不可なセンサーは "Unavailable" バッジで明示
- 各センサー値は本番フローの `useSquatDetector` とは独立購読のため、本番ロジックには一切影響しない

実装に伴って `useSquatDetector` から `nextSquatPhase` / `SquatPhase` / `SQUAT_THRESHOLDS` を export し、デバッグ画面と本番フローで判定ロジックを共有するよう変更。
Pedometer のために iOS の `NSMotionUsageDescription` を `app.config.ts` に追加。
