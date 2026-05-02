// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notification-id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  SchedulableTriggerInputTypes: {
    CALENDAR: 'calendar',
    TIME_INTERVAL: 'timeInterval',
  },
}));

// Mock expo-audio
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    release: jest.fn(),
    loop: false,
    volume: 1.0,
  })),
  setAudioModeAsync: jest.fn(),
}));

// Mock expo-localization
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en', languageTag: 'en-US' }],
  getCalendars: () => [{ calendar: 'gregory', timeZone: 'America/New_York' }],
}));

// Mock i18n module
jest.mock('./src/i18n', () => ({
  __esModule: true,
  default: {
    t: (key) => key,
    use: () => ({ init: () => {} }),
    language: 'en',
  },
}));

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: (_ns) => ({
    t: (key, params) => {
      if (params) return `${key}:${JSON.stringify(params)}`;
      return key;
    },
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

// Mock expo-router
// Stack / Tabs は実際には `<Stack>...<Stack.Screen/>...</Stack>` のように使われる関数コンポーネント。
// 単なる文字列で返すと React.createElement が「Element type is invalid」で死ぬため、
// children を pass-through する関数を返し、Screen は描画なし（null）に倒す。
// これによりレンダースモークテストで _layout.tsx が落ちなくなる。
jest.mock('expo-router', () => {
  const React = require('react');
  const Stack = ({ children }) => React.createElement(React.Fragment, null, children);
  Stack.Screen = () => null;
  const Tabs = ({ children }) => React.createElement(React.Fragment, null, children);
  Tabs.Screen = () => null;
  return {
    useRouter: jest.fn(() => ({
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
    })),
    useLocalSearchParams: jest.fn(() => ({})),
    Link: 'Link',
    Stack,
    Tabs,
  };
});

// Mock expo-alarm-kit（全メソッド網羅）
// AlarmKitService.ts の AlarmKitLive Layer がこのモックを使用する。
jest.mock('expo-alarm-kit', () => ({
  configure: jest.fn().mockReturnValue(true),
  requestAuthorization: jest.fn().mockResolvedValue('authorized'),
  scheduleRepeatingAlarm: jest.fn().mockResolvedValue(true),
  scheduleAlarm: jest.fn().mockResolvedValue(true),
  cancelAlarm: jest.fn().mockResolvedValue(true),
  getAllAlarms: jest.fn().mockReturnValue([]),
  generateUUID: jest.fn().mockReturnValue('test-uuid-1'),
  getLaunchPayload: jest.fn().mockReturnValue(null),
  syncWidgetData: jest.fn().mockResolvedValue(undefined),
  reloadWidgetTimelines: jest.fn().mockResolvedValue(undefined),
  setSnoozeSoundName: jest.fn(),
  getSnoozeAlarmIds: jest.fn().mockReturnValue([]),
  clearSnoozeAlarmIds: jest.fn(),
  getDismissEvents: jest.fn().mockReturnValue([]),
  clearDismissEvents: jest.fn(),
  startLiveActivity: jest.fn().mockResolvedValue('activity-1'),
  updateLiveActivity: jest.fn().mockResolvedValue(true),
  endLiveActivity: jest.fn().mockResolvedValue(true),
}));

// Mock @kingstinct/react-native-healthkit
// 背景: HealthKit はネイティブ依存（NitroModules）を持つため、jest 環境では
// import 時に TurboModuleRegistry.getEnforcing が失敗する。画面ファイル import の
// スモークテストを通すため、グローバルにスタブを提供する。
// 個別テスト（health-sleep-session.test.ts）はファイル先頭で再 mock して必要な値を上書きする。
jest.mock('@kingstinct/react-native-healthkit', () => ({
  isHealthDataAvailable: jest.fn(() => false),
  requestAuthorization: jest.fn(async () => false),
  queryCategorySamples: jest.fn(async () => []),
  CategoryValueSleepAnalysis: { inBed: 0, asleep: 1, awake: 2, asleepUnspecified: 3 },
}));

// Mock expo-task-manager / expo-background-fetch
// 背景: ネイティブ TaskManager に依存。import 時にネイティブモジュール解決で失敗するため。
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(async () => false),
  unregisterTaskAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-background-fetch', () => ({
  registerTaskAsync: jest.fn(async () => undefined),
  unregisterTaskAsync: jest.fn(async () => undefined),
  BackgroundFetchResult: { NoData: 1, NewData: 2, Failed: 3 },
  Status: { Available: 3, Denied: 2, Restricted: 1 },
}));

// Mock expo-sensors（useSquatDetector が DeviceMotion を使う）
jest.mock('expo-sensors', () => ({
  DeviceMotion: {
    isAvailableAsync: jest.fn(async () => false),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    setUpdateInterval: jest.fn(),
    requestPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true })),
  },
  Accelerometer: {
    isAvailableAsync: jest.fn(async () => false),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    setUpdateInterval: jest.fn(),
  },
}));

// Mock expo-constants（app/(tabs)/settings.tsx が Constants.expoConfig を読む）
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { name: 'good-morning', version: '1.2.2' },
    nativeAppVersion: '1.2.2',
    nativeBuildVersion: '1',
    expoVersion: '55.0.0',
  },
}));

// Mock react-native-svg
jest.mock('react-native-svg', () => {
  const React = require('react');
  const MockSvg = (props) => React.createElement('Svg', props);
  MockSvg.displayName = 'Svg';
  const createMockComponent = (name) => {
    const Component = (props) => React.createElement(name, props);
    Component.displayName = name;
    return Component;
  };
  return {
    __esModule: true,
    default: MockSvg,
    Svg: MockSvg,
    Rect: createMockComponent('Rect'),
    Line: createMockComponent('Line'),
    Text: createMockComponent('SvgText'),
    G: createMockComponent('G'),
    Defs: createMockComponent('Defs'),
    ClipPath: createMockComponent('ClipPath'),
  };
});
