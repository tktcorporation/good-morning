import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const STORAGE_KEY = 'app-settings';
const DEFAULT_DAY_BOUNDARY_HOUR = 3;

interface AppSettings {
  readonly dayBoundaryHour: number;
  readonly healthKitEnabled: boolean;
  readonly alarmKitGranted: boolean;
}

interface SettingsState {
  readonly dayBoundaryHour: number;
  readonly healthKitEnabled: boolean;
  readonly alarmKitGranted: boolean;
  readonly loaded: boolean;
  loadSettings: () => Promise<void>;
  setDayBoundaryHour: (hour: number) => Promise<void>;
  setHealthKitEnabled: (enabled: boolean) => Promise<void>;
  setAlarmKitGranted: (granted: boolean) => Promise<void>;
}

async function persist(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** 現在の永続化対象フィールドをまとめて返す。persist() に渡す用途。 */
function currentSettings(get: () => SettingsState): AppSettings {
  return {
    dayBoundaryHour: get().dayBoundaryHour,
    healthKitEnabled: get().healthKitEnabled,
    alarmKitGranted: get().alarmKitGranted,
  };
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  dayBoundaryHour: DEFAULT_DAY_BOUNDARY_HOUR,
  healthKitEnabled: false,
  alarmKitGranted: false,
  loaded: false,

  loadSettings: async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      set({
        dayBoundaryHour: parsed.dayBoundaryHour ?? DEFAULT_DAY_BOUNDARY_HOUR,
        healthKitEnabled: parsed.healthKitEnabled ?? false,
        alarmKitGranted: parsed.alarmKitGranted ?? false,
        loaded: true,
      });
    } else {
      set({ loaded: true });
    }
  },

  setDayBoundaryHour: async (hour: number) => {
    const clamped = Math.max(0, Math.min(23, hour));
    set({ dayBoundaryHour: clamped });
    await persist({ ...currentSettings(get), dayBoundaryHour: clamped });
  },

  setHealthKitEnabled: async (enabled: boolean) => {
    set({ healthKitEnabled: enabled });
    await persist({ ...currentSettings(get), healthKitEnabled: enabled });
  },

  /**
   * AlarmKit の権限許可状態を永続化する。
   *
   * 背景: AlarmKit の権限ステータスは AsyncStorage に保存されていなかったため、
   * 設定画面を開くたびに「未許可」に戻っていた。HealthKit と同様に store 経由で
   * 永続化することで、アプリ再起動後も権限状態を正しく表示する。
   */
  setAlarmKitGranted: async (granted: boolean) => {
    set({ alarmKitGranted: granted });
    await persist({ ...currentSettings(get), alarmKitGranted: granted });
  },
}));
