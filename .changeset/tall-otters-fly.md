---
"good-morning": minor
---

起床タスクに「空の写真」を追加し、スクワットと並ぶ選択肢として設定画面から切り替えられるようにした

- 空判定は端末上の Vision framework（VNClassifyImageRequest）による画像分類のみで行い、
  撮影した写真は端末外に送信・保存しない。ローカル Expo Module `modules/expo-sky-vision` として実装
- 設定画面に起床タスクの種類（スクワット / 空の写真）を切り替えるセクションを追加
- `expo-camera` を依存に追加し、`NSCameraUsageDescription` を設定
