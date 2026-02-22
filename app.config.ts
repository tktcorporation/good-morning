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
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#1a1a2e',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.tktcorporation.goodmorning',
    infoPlist: {
      UIBackgroundModes: ['audio'],
      ITSAppUsesNonExemptEncryption: false,
    },
    entitlements: {
      'com.apple.developer.healthkit': true,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#1a1a2e',
    },
    package: 'com.goodmorning.app',
    edgeToEdgeEnabled: true,
    permissions: ['android.permission.RECORD_AUDIO', 'android.permission.MODIFY_AUDIO_SETTINGS'],
  },
  plugins: [
    'expo-router',
    'expo-av',
    [
      'react-native-health',
      {
        healthSharePermission:
          'Good Morning はあなたの睡眠データを読み取り、起床パターンを分析します',
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
