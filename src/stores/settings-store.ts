import { Effect, Schema } from 'effect';
import { create } from 'zustand';
import { STORAGE_KEYS } from '../constants/storage-keys';
import { asRecord, decodeFieldOrDefault, decodeStoredJson, runEffect, Storage } from '../services';
import type { StorageError } from '../services/errors';
import { logError } from '../utils/logger';

const STORAGE_KEY = STORAGE_KEYS.appSettings;
const DEFAULT_DAY_BOUNDARY_HOUR = 3;

interface AppSettings {
  readonly dayBoundaryHour: number;
  readonly healthKitEnabled: boolean;
  readonly alarmKitGranted: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  dayBoundaryHour: DEFAULT_DAY_BOUNDARY_HOUR,
  healthKitEnabled: false,
  alarmKitGranted: false,
};

/**
 * 永続化済み settings をフィールド単位で寛容にデコードする。
 *
 * Schema.Struct による一括デコードは、1フィールドが型不一致なだけで構造体全体を
 * 失敗させ、他の正常なフィールド（例: alarmKitGranted の権限許可状態）まで
 * デフォルト値に巻き添えで上書きしてしまう。decodeFieldOrDefault でフィールドごとに
 * デコードし、破損は該当フィールドのみデフォルト値に倒す。
 */
function decodeAppSettings(parsed: unknown): AppSettings {
  const obj = asRecord(parsed);
  return {
    dayBoundaryHour: decodeFieldOrDefault(
      Schema.Number,
      obj.dayBoundaryHour,
      DEFAULT_DAY_BOUNDARY_HOUR,
    ),
    healthKitEnabled: decodeFieldOrDefault(Schema.Boolean, obj.healthKitEnabled, false),
    alarmKitGranted: decodeFieldOrDefault(Schema.Boolean, obj.alarmKitGranted, false),
  };
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

function persist(settings: AppSettings): Promise<void> {
  return runEffect(
    Storage.pipe(Effect.flatMap((storage) => storage.set(STORAGE_KEY, JSON.stringify(settings)))),
  );
}

/**
 * settings を読み取ってデコードする Effect。
 * 読み取り自体の失敗（StorageError、リトライ後も解決しない）はそのまま呼び出し元に
 * 伝播させる。JSON パース失敗（未設定含む）は全体をデフォルト値に倒すが、
 * JSON としては読めたがフィールド単位で不整合がある場合は decodeAppSettings が
 * 個別フィールドのみデフォルト値にフォールバックする。
 */
function loadSettingsEffect(): Effect.Effect<AppSettings, StorageError, Storage> {
  return Storage.pipe(
    Effect.flatMap((storage) => storage.get(STORAGE_KEY)),
    Effect.flatMap((raw) => decodeStoredJson(STORAGE_KEY, Schema.Unknown, raw)),
    Effect.map((decoded) => (decoded === null ? DEFAULT_SETTINGS : decodeAppSettings(decoded))),
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
      logError('settings-store', 'loadSettings failed after retries', error);
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
