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
