import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettingsStore } from '../stores/settings-store';

const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;

describe('useSettingsStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({
      dayBoundaryHour: 3,
      healthKitEnabled: false,
      loaded: false,
    });
  });

  test('loadSettings returns defaults when no stored data', async () => {
    mockGetItem.mockResolvedValue(null);
    await useSettingsStore.getState().loadSettings();
    const state = useSettingsStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.dayBoundaryHour).toBe(3);
  });

  test('loadSettings restores stored settings', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify({ dayBoundaryHour: 4 }));
    await useSettingsStore.getState().loadSettings();
    expect(useSettingsStore.getState().dayBoundaryHour).toBe(4);
  });

  test('setDayBoundaryHour persists to AsyncStorage', async () => {
    await useSettingsStore.getState().loadSettings();
    await useSettingsStore.getState().setDayBoundaryHour(5);
    expect(useSettingsStore.getState().dayBoundaryHour).toBe(5);
    expect(mockSetItem).toHaveBeenCalledWith(
      'app-settings',
      expect.stringContaining('"dayBoundaryHour":5'),
    );
  });

  test('healthKitEnabled defaults to false', async () => {
    mockGetItem.mockResolvedValue(null);
    await useSettingsStore.getState().loadSettings();
    expect(useSettingsStore.getState().healthKitEnabled).toBe(false);
  });

  test('setHealthKitEnabled persists to AsyncStorage', async () => {
    await useSettingsStore.getState().loadSettings();
    await useSettingsStore.getState().setHealthKitEnabled(true);
    expect(useSettingsStore.getState().healthKitEnabled).toBe(true);
    expect(mockSetItem).toHaveBeenCalledWith(
      'app-settings',
      expect.stringContaining('"healthKitEnabled":true'),
    );
  });

  test('loadSettings restores healthKitEnabled', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify({ dayBoundaryHour: 3, healthKitEnabled: true }));
    await useSettingsStore.getState().loadSettings();
    expect(useSettingsStore.getState().healthKitEnabled).toBe(true);
  });

  test('setDayBoundaryHour clamps to 0-23 range', async () => {
    await useSettingsStore.getState().loadSettings();
    await useSettingsStore.getState().setDayBoundaryHour(23);
    expect(useSettingsStore.getState().dayBoundaryHour).toBe(23);
    await useSettingsStore.getState().setDayBoundaryHour(24);
    expect(useSettingsStore.getState().dayBoundaryHour).toBe(23);
    await useSettingsStore.getState().setDayBoundaryHour(-1);
    expect(useSettingsStore.getState().dayBoundaryHour).toBe(0);
  });
});
