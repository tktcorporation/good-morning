import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { STORAGE_KEYS } from '../constants/storage-keys';
import { readStorageItemWithRetry } from '../utils/storage-read';

const STORAGE_KEY = STORAGE_KEYS.appSettings;
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

/** 永続化済み settings のパース。破損はデフォルト値扱い（loaded=false のまま固まるのを防ぐ）。 */
function parseStoredSettings(raw: string | null): AppSettings {
  const defaults: AppSettings = {
    dayBoundaryHour: DEFAULT_DAY_BOUNDARY_HOUR,
    healthKitEnabled: false,
    alarmKitGranted: false,
  };
  if (raw === null) return defaults;
  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      dayBoundaryHour: parsed.dayBoundaryHour ?? DEFAULT_DAY_BOUNDARY_HOUR,
      healthKitEnabled: parsed.healthKitEnabled ?? false,
      alarmKitGranted: parsed.alarmKitGranted ?? false,
    };
  } catch {
    return defaults;
  }
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
    // パース失敗（データは読めたが壊れている）はデフォルト値扱いで確定して
    // よいが、読み取り自体の失敗（リトライしても解決しない）は実際の設定値の
    // 有無が確認できていない。loaded=true にすると dayBoundaryHour 等が
    // デフォルト値のまま syncAlarmsEffect 等の「settings ロード待ち」ガードが
    // 誤って解除され、誤った設定でアラーム同期・セッション判定が走ってしまう
    // ため、loaded=false のまま留めて以降の再試行（アプリ再起動等）に委ねる
    let raw: string | null;
    try {
      raw = await readStorageItemWithRetry(STORAGE_KEY);
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole: 起動時初期化の失敗を握り潰さず可視化する
      console.error('[settings-store] loadSettings failed after retries', error);
      return;
    }
    set({ ...parseStoredSettings(raw), loaded: true });
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
