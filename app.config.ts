import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Good Morning',
  slug: 'good-morning',
  version: require('./package.json').version,
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'good-morning',
  userInterfaceStyle: 'automatic',
  runtimeVersion: {
    policy: 'fingerprint',
  },
  updates: {
    url: 'https://u.expo.dev/a7deb1ff-f5c1-4073-b33a-1505a7073130',
  },
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#1a1a2e',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.tktcorporation.goodmorning',
    // Widget Extension（@bacons/apple-targets）の署名に Apple Team ID が必要。
    // メインアプリは EAS 管理の証明書で署名するため従来は不要だったが、
    // Extension ターゲットを追加すると prebuild 時に要求される。
    // 秘匿情報ではないが環境ごとに異なるため、ハードコードせず APPLE_TEAM_ID 環境変数で渡す。
    // 未設定でも CI の Simulator ビルド（CODE_SIGNING_ALLOWED=NO）は通る。
    appleTeamId: process.env.APPLE_TEAM_ID,
    infoPlist: {
      UIBackgroundModes: ['audio', 'fetch'],
      ITSAppUsesNonExemptEncryption: false,
      NSAlarmKitUsageDescription: 'Good Morning uses alarms to wake you up at your scheduled time.',
      // CMPedometer (歩数) と CMAltimeter (Barometer / 気圧計) は iOS で
      // NSMotionUsageDescription を要求する。本番フローの Accelerometer (CMMotionManager)
      // 自体は不要だが、設定 → スクワット動作確認画面の歩数・気圧センサー表示で必須。
      NSMotionUsageDescription:
        'Good Morning uses motion data to detect squats and to show real-time movement information in the squat debug screen.',
      NSSupportsLiveActivities: true,
    },
    entitlements: {
      'com.apple.developer.healthkit': true,
      'com.apple.security.application-groups': ['group.com.tktcorporation.goodmorning'],
    },
  },
  web: {
    bundler: 'metro',
    favicon: './assets/icon.png',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#1a1a2e',
    },
    package: 'com.goodmorning.app',
    permissions: ['android.permission.RECORD_AUDIO', 'android.permission.MODIFY_AUDIO_SETTINGS'],
  },
  plugins: [
    'expo-router',
    'expo-asset',
    'expo-audio',
    'expo-localization',
    // Widget Extension（ホームウィジェット + Live Activity）を Xcode ターゲットとして生成する。
    // 実体は targets/widget/ 配下の Swift。prebuild で ios/ にリンクされる。
    // Live Activity の表示には Widget Extension が必須のため、このプラグインが無いと
    // startLiveActivity / syncWidgetData が App Groups に書き込んでも表示先が存在しない。
    '@bacons/apple-targets',
    [
      'expo-build-properties',
      {
        ios: {
          deploymentTarget: '26.0',
        },
      },
    ],
    [
      '@kingstinct/react-native-healthkit',
      {
        NSHealthShareUsageDescription:
          'Good Morning はあなたの睡眠データを読み取り、起床パターンを分析します',
        NSHealthUpdateUsageDescription: false,
        background: false,
      },
    ],
  ],
  extra: {
    router: {},
    eas: {
      projectId: 'a7deb1ff-f5c1-4073-b33a-1505a7073130',
    },
  },
  owner: 'tktcorporation',
});
