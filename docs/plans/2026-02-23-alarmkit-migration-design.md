# AlarmKit Migration Design

## Problem

アプリを終了した状態でサイレントモード（マナーモード）がONだと、アラーム時刻に通知は届くが音が鳴らない。アラームアプリとして致命的。

### Root Cause

現在のアーキテクチャはアラーム音の再生を2つの仕組みに依存：

1. **expo-notifications** — ローカル通知をスケジュール。通知音はiOSのサイレントスイッチに従うため、サイレントモードでは無音
2. **expo-av** — `playsInSilentModeIOS: true` でサイレントスイッチをバイパスできるが、アプリのプロセスが生きている時のみ有効

アプリ終了時は expo-av が使えず、通知音のみに依存するため、サイレントモードで無音になる。

## Solution

iOS 26 の AlarmKit フレームワークを使用。`expo-alarm-kit` (v0.1.6) ライブラリ経由で統合。

AlarmKit はiOSシステムレベルでアラームを管理するため、サイレントモード・集中モードを完全にバイパスしてサウンドを再生する（Apple純正の時計アプリと同等の権限）。

## Architecture

### Before (Current)

```
WakeTarget Store
  → expo-notifications (scheduleWakeTargetNotifications)
    → iOS Local Notification → 通知音 (※サイレント時は無音)
  → expo-av (playAlarmSound) → アプリ内音声再生 (フォアグラウンドのみ)
```

### After (Proposed)

```
WakeTarget Store
  → expo-alarm-kit (AlarmKit)
    → iOS System Alarm → 常にサウンド再生 (サイレントモード無視)
    → アラーム解除時にアプリを起動 (launchAppOnDismiss)
  → expo-notifications → フォアグラウンド時の補助通知のみ
  → expo-av → デモ試聴・プレビューのみ
```

## Changes

### 1. New Service: `src/services/alarm-kit.ts`

AlarmKit のラッパーサービス。以下のAPIを提供：

- `initializeAlarmKit()` — App Group の設定と権限リクエスト
- `scheduleWakeTargetAlarm(target: WakeTarget)` — WakeTarget からAlarmKit アラームをスケジュール
- `cancelAllAlarms()` — 全アラームのキャンセル

内部処理:
- 曜日ごとの `scheduleRepeatingAlarm` (enabled な曜日のみ)
- nextOverride がある場合は `scheduleAlarm` (one-time)
- `launchAppOnDismiss: true` でアラーム解除時にアプリを起動

### 2. Modified: `app/_layout.tsx`

- 起動時に `configure()` と `requestAuthorization()` を呼ぶ
- `getLaunchPayload()` でアラームからの起動を検知し、wakeup画面に遷移
- WakeTarget 変更時のスケジューリングを AlarmKit ベースに切り替え

### 3. Modified: `src/services/notifications.ts`

- `scheduleWakeTargetNotifications` はAlarmKit非対応環境のフォールバック or 削除
- 通知リスナー (`addNotificationReceivedListener` / `addNotificationResponseListener`) は残す
  - フォアグラウンド時にAlarmKitアラームの補助として機能

### 4. Modified: `app/wakeup.tsx`

- アラーム音再生ロジックの簡略化
- AlarmKit がシステムレベルで音を鳴らすので、expo-av での音再生はデモモードのみに限定
- AlarmKit からの起動ペイロードの処理追加

### 5. Modified: `app.config.ts`

- `ios.infoPlist` に追加:
  - `NSAlarmKitUsageDescription` — AlarmKit 使用理由の説明文
  - `NSSupportsLiveActivities: true`
- App Groups capability の追加（config plugin or Xcode手動設定）

### 6. Sound File Bundling

- `assets/sounds/` のファイルをiOS バンドル (`Library/Sounds/`) にもコピーする仕組みが必要
- expo-alarm-kit の example では `react-native-fs` を使用しているが、config plugin でビルド時にバンドルする方法も検討

## Data Flow: Alarm Scheduling

```
1. User sets wake target
2. WakeTarget store updates
3. _layout.tsx detects change
4. For each enabled day:
   - Convert DayOfWeek (0=Sun) to iOS weekday (1=Sun)
   - Call scheduleRepeatingAlarm({ hour, minute, weekdays, title, launchAppOnDismiss: true })
5. If nextOverride exists:
   - Calculate epoch seconds
   - Call scheduleAlarm({ epochSeconds, title, launchAppOnDismiss: true })
6. Store alarm IDs in WakeTarget store (replacing notification IDs)
```

## Data Flow: Alarm Trigger

```
1. iOS AlarmKit fires at scheduled time
2. System alarm UI appears (even in silent mode, even if app is killed)
3. User taps "Stop"
4. App launches via launchAppOnDismiss intent
5. _layout.tsx checks getLaunchPayload()
6. If payload exists → router.push('/wakeup')
7. Wakeup flow begins (todo tasks, etc.)
```

## Requirements

- iOS 26.0+ (deployment target)
- Expo SDK 54 (already in use)
- `npx expo prebuild` (Expo Go is not supported)
- App Groups configured in Xcode

## Risks

1. **expo-alarm-kit は v0.1.6** — まだ若いライブラリ。必要に応じて fork or 自作に切り替え可能
2. **iOS 26+ 限定** — iOS 25以前のユーザーは利用不可（2026年2月時点では問題にならない想定）
3. **サウンドファイルのバンドル** — Library/Sounds へのコピー方法は検証が必要
4. **App Groups** — Xcode での手動設定が必要になる可能性

## Testing

- ユニットテスト: AlarmKit サービスのモック テスト
- 実機テスト: サイレントモードでのアラーム発火確認（必須）
- E2E: アラーム → アプリ起動 → wakeup画面遷移の確認
