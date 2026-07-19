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

  test('AsyncStorage.getItem が一時的に reject してもリトライで復旧し、実際の設定値を失わない', async () => {
    // 1回目は一時的な失敗、2回目で成功するケース。ここで即座にデフォルト値に
    // 倒すと、ユーザーが実際に設定した dayBoundaryHour 等が失われ、
    // loaded=true のまま誤った設定でセッション判定・アラーム同期が走ってしまう
    mockGetItem
      .mockRejectedValueOnce(new Error('transient storage error'))
      .mockResolvedValueOnce(JSON.stringify({ dayBoundaryHour: 8 }));
    await expect(useSettingsStore.getState().loadSettings()).resolves.toBeUndefined();
    const state = useSettingsStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.dayBoundaryHour).toBe(8);
  });

  test('AsyncStorage.getItem がリトライしても reject し続ける場合、loaded=false のまま留まる', async () => {
    // 読み取り自体が失敗し続ける場合、実際の設定値が確認できていない。
    // loaded=true にすると dayBoundaryHour がデフォルト値のまま syncAlarmsEffect
    // 等の「settings ロード待ち」ガードが誤って解除され、誤った設定で
    // アラーム同期・セッション判定が走ってしまうため、loaded=false のまま留める
    mockGetItem
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockRejectedValueOnce(new Error('storage unavailable'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(useSettingsStore.getState().loadSettings()).resolves.toBeUndefined();
    const state = useSettingsStore.getState();
    expect(state.loaded).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  test('破損 JSON では reject せず loaded=true・デフォルト値で確定する（データは読めたが復元不能なため）', async () => {
    mockGetItem.mockResolvedValueOnce('not-json{{{');
    await expect(useSettingsStore.getState().loadSettings()).resolves.toBeUndefined();
    const state = useSettingsStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.dayBoundaryHour).toBe(3);
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

  test('dayBoundaryHour変更後も既存設定が保持される', async () => {
    mockGetItem.mockResolvedValue(
      JSON.stringify({
        dayBoundaryHour: 3,
        healthKitEnabled: true,
        alarmKitGranted: true,
      }),
    );
    await useSettingsStore.getState().loadSettings();
    await useSettingsStore.getState().setDayBoundaryHour(12);
    expect(useSettingsStore.getState().dayBoundaryHour).toBe(12);
    expect(useSettingsStore.getState().healthKitEnabled).toBe(true);
    expect(useSettingsStore.getState().alarmKitGranted).toBe(true);
  });
});
