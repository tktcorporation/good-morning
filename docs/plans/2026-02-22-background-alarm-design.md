# Background Alarm Design

## Goal

アプリを落としていても（完全キル含む）アラームが鳴るようにする。iOS のみ対象。

## Current State

- `expo-notifications` の Calendar トリガーで通知をスケジュール
- 通知自体はアプリキル時も OS が配信する
- ただし通知音は短い（OS デフォルト or カスタム音の先頭数秒）
- `expo-av` によるループ再生はアプリがフォアグラウンドの時のみ

## Approach: Hybrid (Long Notification Sound + Repeated Notifications + BG Audio)

### 1. カスタム通知音の長尺化

- 既存の `alarm.wav` を 30秒の `.caf` に変換して `assets/sounds/alarm-notification.caf` に配置
- 通知の `sound` フィールドでこのファイルを参照
- iOS の通知音は最大30秒（OS 制限）

### 2. 連続通知スケジュール

- アラーム時刻から 30秒間隔で 5回の通知をスケジュール（合計 2.5分）
  - 例: 7:00:00, 7:00:30, 7:01:00, 7:01:30, 7:02:00
- `notifications.ts` の `scheduleWakeTargetNotifications` を修正
- 各曜日ごとに 5つの通知を作成（最大 7曜日 × 5 = 35 通知）
- dismiss 時に残りの通知をキャンセル

### 3. バックグラウンド時の即時ループ再生

- `_layout.tsx` の `addNotificationReceivedListener` で:
  1. `playAlarmSound()` を即座に呼ぶ
  2. `Vibration.vibrate()` を開始
  3. `/wakeup` に遷移
- `UIBackgroundModes: ['audio']` は既に `app.config.ts` に設定済み

### 4. Dismiss 時の後続通知キャンセル

- `wakeup.tsx` の `handleDismiss` で `cancelAlarmNotifications(notificationIds)` を呼ぶ
- `notificationIds` を store で永続化（AsyncStorage）

## Files to Modify

| File | Change |
|------|--------|
| `assets/sounds/alarm-notification.caf` | New: 30s notification sound |
| `src/services/notifications.ts` | Repeated scheduling + cancel logic |
| `src/stores/wake-target-store.ts` | Persist notificationIds |
| `app/_layout.tsx` | BG audio + vibration on notification received |
| `app/wakeup.tsx` | Cancel remaining notifications on dismiss |

## Constraints

- iOS only (Android later)
- No CallKit/VoIP Push (Apple rejects for non-call use)
- No Critical Alert (requires special Apple entitlement)
- Max 30s per notification sound (iOS limit)
- expo-notifications Calendar trigger for scheduling
