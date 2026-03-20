---
"good-morning": minor
---

カスタムアラーム音選択と全画面独自アラーム画面を削除し、AlarmKit に一本化

- カスタムアラーム音選択UI（設定画面）を削除
- SoundService / alarm-sounds.ts / カスタム音声アセット（chime, birds, bell）を削除
- WakeTarget から soundId フィールドを削除
- AlarmKit のスケジュール API から soundName パラメータを削除（OS デフォルト音を使用）
- 全画面アラーム画面（app/wakeup.tsx）を削除
- アラーム dismiss 時は AlarmEventRouter でインライン処理（wakeup 画面を経由しない）
- オンボーディングのデモステップからアラームデモ機能を削除
