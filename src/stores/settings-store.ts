import { Effect, Schema } from 'effect';
import { create } from 'zustand';
import { STORAGE_KEYS } from '../constants/storage-keys';
import { decodeStoredJson, runEffect, Storage } from '../services';
import type { StorageError } from '../services/errors';

const STORAGE_KEY = STORAGE_KEYS.appSettings;
const DEFAULT_DAY_BOUNDARY_HOUR = 3;

/**
 * 永続化済み settings のスキーマ。欠落フィールドはデフォルト値で補う。
 * 型不一致（例: dayBoundaryHour が文字列）はデコード全体を失敗させ、
 * 呼び出し側で「データ破損」として全体をデフォルト値にフォールバックする。
 */
const AppSettingsSchema = Schema.Struct({
  dayBoundaryHour: Schema.optionalWith(Schema.Number, {
    default: () => DEFAULT_DAY_BOUNDARY_HOUR,
  }),
  healthKitEnabled: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  alarmKitGranted: Schema.optionalWith(Schema.Boolean, { default: () => false }),
});
type AppSettings = typeof AppSettingsSchema.Type;

const DEFAULT_SETTINGS: AppSettings = {
  dayBoundaryHour: DEFAULT_DAY_BOUNDARY_HOUR,
  healthKitEnabled: false,
  alarmKitGranted: false,
};

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

function persist(settings: AppSettings): Promise<void> {
  return runEffect(
    Storage.pipe(Effect.flatMap((storage) => storage.set(STORAGE_KEY, JSON.stringify(settings)))),
  );
}

/**
 * settings を読み取ってデコードする Effect。
 * 読み取り自体の失敗（StorageError、リトライ後も解決しない）はそのまま呼び出し元に
 * 伝播させ、データ破損（スキーマ不一致・JSON パース失敗）のみデフォルト値に倒す。
 */
function loadSettingsEffect(): Effect.Effect<AppSettings, StorageError, Storage> {
  return Storage.pipe(
    Effect.flatMap((storage) => storage.get(STORAGE_KEY)),
    Effect.flatMap((raw) => decodeStoredJson(STORAGE_KEY, AppSettingsSchema, raw)),
    Effect.map((decoded) => decoded ?? DEFAULT_SETTINGS),
    Effect.catchTag('StorageDecodeError', () => Effect.succeed(DEFAULT_SETTINGS)),
  );
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
    // 読み取り自体の失敗（StorageError、リトライしても解決しない）は実際の設定値の
    // 有無が確認できていない。loaded=true にすると dayBoundaryHour 等が
    // デフォルト値のまま syncAlarmsEffect 等の「settings ロード待ち」ガードが
    // 誤って解除され、誤った設定でアラーム同期・セッション判定が走ってしまう
    // ため、loaded=false のまま留めて以降の再試行（アプリ再起動等）に委ねる
    try {
      const settings = await runEffect(loadSettingsEffect());
      set({ ...settings, loaded: true });
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole: 起動時初期化の失敗を握り潰さず可視化する
      console.error('[settings-store] loadSettings failed after retries', error);
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
