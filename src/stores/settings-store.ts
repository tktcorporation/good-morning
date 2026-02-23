import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const STORAGE_KEY = 'app-settings';
const DEFAULT_DAY_BOUNDARY_HOUR = 3;

interface AppSettings {
  readonly dayBoundaryHour: number;
}

interface SettingsState {
  readonly dayBoundaryHour: number;
  readonly loaded: boolean;
  loadSettings: () => Promise<void>;
  setDayBoundaryHour: (hour: number) => Promise<void>;
}

async function persist(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export const useSettingsStore = create<SettingsState>((set) => ({
  dayBoundaryHour: DEFAULT_DAY_BOUNDARY_HOUR,
  loaded: false,

  loadSettings: async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as AppSettings;
      set({ dayBoundaryHour: parsed.dayBoundaryHour, loaded: true });
    } else {
      set({ loaded: true });
    }
  },

  setDayBoundaryHour: async (hour: number) => {
    const clamped = Math.max(0, Math.min(6, hour));
    set({ dayBoundaryHour: clamped });
    await persist({ dayBoundaryHour: clamped });
  },
}));
