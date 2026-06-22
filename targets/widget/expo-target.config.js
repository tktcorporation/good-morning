/**
 * Widget Extension のターゲット設定（@bacons/apple-targets）。
 *
 * 背景: ホームウィジェットと Live Activity を表示するための iOS Widget Extension。
 * メインアプリとは App Groups UserDefaults 経由でデータを共有する:
 *   - ホームウィジェット: "widget-data" キーの JSON（buildWidgetData が書き込む）
 *   - Live Activity: expo-alarm-kit の startLiveActivity が ActivityKit で開始
 *
 * App Groups は app.config.ts の ios.entitlements から自動ミラーされるが、
 * 共有先を明示するため関数形式で取得している。
 *
 * deploymentTarget: Live Activity の content API は iOS 16.2+、WidgetKit は 14+。
 * 本体（26.0）まで上げる必要はないが、Live Activity を使うため 16.2 以上にする。
 *
 * ESM/TS 非対応のため require/module.exports で記述する（apple-targets の制約）。
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: 'widget',
  name: 'GoodMorningWidget',
  deploymentTarget: '16.2',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
  entitlements: {
    'com.apple.security.application-groups': config.ios?.entitlements?.[
      'com.apple.security.application-groups'
    ] ?? ['group.com.tktcorporation.goodmorning'],
  },
});
