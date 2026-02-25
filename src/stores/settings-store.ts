import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const STORAGE_KEY = 'app-settings';
const DEFAULT_DAY_BOUNDARY_HOUR = 3;

interface AppSettings {
  readonly dayBoundaryHour: number;
  readonly healthKitEnabled: boolean;
}

interface SettingsState {
  readonly dayBoundaryHour: number;
  readonly healthKitEnabled: boolean;
  readonly loaded: boolean;
  loadSettings: () => Promise<void>;
  setDayBoundaryHour: (hour: number) => Promise<void>;
  setHealthKitEnabled: (enabled: boolean) => Promise<void>;
}

async function persist(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  dayBoundaryHour: DEFAULT_DAY_BOUNDARY_HOUR,
  healthKitEnabled: false,
  loaded: false,

  loadSettings: async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      set({
        dayBoundaryHour: parsed.dayBoundaryHour ?? DEFAULT_DAY_BOUNDARY_HOUR,
        healthKitEnabled: parsed.healthKitEnabled ?? false,
        loaded: true,
      });
    } else {
      set({ loaded: true });
    }
  },

  setDayBoundaryHour: async (hour: number) => {
    const clamped = Math.max(0, Math.min(6, hour));
    set({ dayBoundaryHour: clamped });
    await persist({
      dayBoundaryHour: clamped,
      healthKitEnabled: get().healthKitEnabled,
    });
  },

  setHealthKitEnabled: async (enabled: boolean) => {
    set({ healthKitEnabled: enabled });
    await persist({
      dayBoundaryHour: get().dayBoundaryHour,
      healthKitEnabled: enabled,
    });
  },
}));
