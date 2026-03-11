import { buildWidgetData } from '../services/widget-sync';
import { useDailyGradeStore } from '../stores/daily-grade-store';
import { useMorningSessionStore } from '../stores/morning-session-store';
import { useWakeTargetStore } from '../stores/wake-target-store';

// alarm-kit は native module なのでモック
jest.mock('../services/alarm-kit', () => ({
  syncWidgetData: jest.fn(),
  reloadWidgetTimelines: jest.fn(),
  APP_GROUP_ID: 'group.test',
}));

// AsyncStorage モック
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

const sampleTodos = [
  { id: 'todo_1', title: '水を飲む', completed: false, completedAt: null },
  { id: 'todo_2', title: 'ストレッチ', completed: false, completedAt: null },
];

beforeEach(() => {
  // ストアをリセット
  useWakeTargetStore.setState({ target: null, loaded: false, alarmIds: [] });
  useMorningSessionStore.setState({
    session: null,
    loaded: false,
  });
  useDailyGradeStore.setState({
    grades: [],
    streak: {
      currentStreak: 0,
      longestStreak: 0,
      freezesAvailable: 0,
      freezesUsedTotal: 0,
      lastGradedDate: null,
    },
    loaded: false,
  });
});

test('returns null nextAlarm when no target', () => {
  const data = buildWidgetData();
  expect(data.nextAlarm).toBeNull();
});

test('returns nextAlarm with time when target exists', () => {
  useWakeTargetStore.setState({
    target: {
      defaultTime: { hour: 6, minute: 30 },
      dayOverrides: {},
      nextOverride: null,
      todos: [],
      enabled: true,
      soundId: 'default',
      targetSleepMinutes: null,
      wakeUpGoalBufferMinutes: 30,
    },
    loaded: true,
    alarmIds: [],
  });
  const data = buildWidgetData();
  expect(data.nextAlarm).not.toBeNull();
  expect(data.nextAlarm?.time).toBe('06:30');
  expect(data.nextAlarm?.enabled).toBe(true);
});

test('returns null session when no active session', () => {
  const data = buildWidgetData();
  expect(data.session).toBeNull();
});

test('returns session with progress when session active', async () => {
  await useMorningSessionStore.getState().startSession('2026-02-28', sampleTodos, null, '2026-02-28T08:00:00.000Z');
  const data = buildWidgetData();
  expect(data.session).not.toBeNull();
  expect(data.session?.progress).toEqual({ completed: 0, total: 2 });
  expect(data.session?.todos).toHaveLength(2);
});

test('returns streak from daily grade store', () => {
  useDailyGradeStore.setState({
    grades: [],
    streak: {
      currentStreak: 5,
      longestStreak: 10,
      freezesAvailable: 1,
      freezesUsedTotal: 2,
      lastGradedDate: null,
    },
    loaded: true,
  });
  const data = buildWidgetData();
  expect(data.streak.currentStreak).toBe(5);
});

test('updatedAt is a valid ISO string', () => {
  const data = buildWidgetData();
  expect(() => new Date(data.updatedAt)).not.toThrow();
  expect(new Date(data.updatedAt).toISOString()).toBe(data.updatedAt);
});
