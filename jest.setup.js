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
  SchedulableTriggerInputTypes: {
    CALENDAR: 'calendar',
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

// Mock expo-alarm-kit
jest.mock('expo-alarm-kit', () => ({
  configure: jest.fn(() => true),
  requestAuthorization: jest.fn().mockResolvedValue('authorized'),
  generateUUID: jest.fn(() => 'mock-uuid'),
  scheduleAlarm: jest.fn().mockResolvedValue(true),
  scheduleRepeatingAlarm: jest.fn().mockResolvedValue(true),
  cancelAlarm: jest.fn().mockResolvedValue(true),
  getAllAlarms: jest.fn(() => []),
  clearAllAlarms: jest.fn(),
  removeAlarm: jest.fn(),
  getLaunchPayload: jest.fn(() => null),
}));

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  })),
  useLocalSearchParams: jest.fn(() => ({})),
  Link: 'Link',
  Stack: {
    Screen: 'Screen',
  },
  Tabs: {
    Screen: 'Screen',
  },
}));

// Mock expo-alarm-kit
jest.mock('expo-alarm-kit', () => ({
  configure: jest.fn().mockReturnValue(true),
  requestAuthorization: jest.fn().mockResolvedValue('authorized'),
  scheduleRepeatingAlarm: jest.fn().mockResolvedValue(true),
  scheduleAlarm: jest.fn().mockResolvedValue(true),
  cancelAlarm: jest.fn().mockResolvedValue(true),
  getAllAlarms: jest.fn().mockReturnValue([]),
  generateUUID: jest.fn().mockReturnValue('test-uuid-1'),
  getLaunchPayload: jest.fn().mockReturnValue(null),
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
