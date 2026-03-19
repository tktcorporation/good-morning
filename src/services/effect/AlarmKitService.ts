/**
 * AlarmKit ネイティブモジュールへのアクセスを抽象化する Effect サービス。
 *
 * 背景: alarm-kit.ts はグローバル変数でモジュールを遅延ロードし、
 * 各関数が null チェックを個別に行っていた。Effect の Context.Tag で
 * サービスとして定義することで：
 * - null チェックが Layer 構築時に一元化される
 * - テスト時にモック実装に差し替え可能
 * - エラーが AlarmKitUnavailableError / AlarmKitOperationError として型追跡される
 *
 * 呼び出し元: AlarmSchedulerService, AlarmSyncService, WidgetSyncService, LiveActivityService
 */

import { Context, Effect, Layer } from 'effect';
import { AlarmKitOperationError, AlarmKitUnavailableError } from './errors';

/** AlarmKit の操作で発生しうるエラーの union 型 */
export type AlarmKitError = AlarmKitUnavailableError | AlarmKitOperationError;

// ─── サービスインターフェース ────────────────────────────────────

export interface AlarmKitService {
  /** AlarmKit の認可をリクエストし、App Group を設定する */
  readonly initialize: Effect.Effect<'authorized' | 'denied', AlarmKitError>;

  /** アプリ起動時のペイロードを取得（アラーム経由の起動判定） */
  readonly checkLaunchPayload: Effect.Effect<
    { alarmId: string; payload: string | null } | null,
    never
  >;

  /** 繰り返しアラームをスケジュール */
  readonly scheduleRepeatingAlarm: (params: {
    id: string;
    hour: number;
    minute: number;
    weekdays: number[];
    title: string;
    soundName?: string;
  }) => Effect.Effect<boolean, AlarmKitError>;

  /** ワンショットアラームをスケジュール */
  readonly scheduleAlarm: (params: {
    id: string;
    epochSeconds: number;
    title: string;
    soundName?: string;
    dismissPayload?: string;
  }) => Effect.Effect<boolean, AlarmKitError>;

  /** アラームをキャンセル */
  readonly cancelAlarm: (id: string) => Effect.Effect<void, AlarmKitError>;

  /** 登録済みの全アラーム ID を取得 */
  readonly getAllAlarms: Effect.Effect<readonly string[], never>;

  /** UUID を生成 */
  readonly generateUUID: Effect.Effect<string, never>;

  /** App Groups UserDefaults にウィジェットデータを書き込む */
  readonly syncWidgetData: (json: string) => Effect.Effect<void, AlarmKitError>;

  /** WidgetCenter のタイムラインを全更新 */
  readonly reloadWidgetTimelines: Effect.Effect<void, AlarmKitError>;

  /** スヌーズ音名を App Groups に保存 */
  readonly setSnoozeSoundName: (name: string | undefined) => Effect.Effect<void, never>;

  /** ネイティブが保存したスヌーズアラーム ID を取得 */
  readonly getSnoozeAlarmIds: Effect.Effect<readonly string[], never>;

  /** スヌーズアラーム ID をクリア */
  readonly clearSnoozeAlarmIds: Effect.Effect<void, never>;

  /** ネイティブ dismiss イベントを取得 */
  readonly getDismissEvents: Effect.Effect<
    readonly { alarmId: string; dismissedAt: string; payload: string }[],
    never
  >;

  /** dismiss イベントをクリア */
  readonly clearDismissEvents: Effect.Effect<void, never>;

  /** Live Activity を開始 */
  readonly startLiveActivity: (
    todos: readonly { id: string; title: string; completed: boolean }[],
    snoozeEpoch: number | null,
  ) => Effect.Effect<string | null, AlarmKitError>;

  /** Live Activity を更新 */
  readonly updateLiveActivity: (
    activityId: string,
    todos: readonly { id: string; title: string; completed: boolean }[],
    snoozeEpoch: number | null,
  ) => Effect.Effect<void, AlarmKitError>;

  /** Live Activity を終了 */
  readonly endLiveActivity: (activityId: string) => Effect.Effect<void, AlarmKitError>;
}

export class AlarmKit extends Context.Tag('AlarmKit')<AlarmKit, AlarmKitService>() {}

// ─── ネイティブ実装 Layer ────────────────────────────────────────

const APP_GROUP_ID = 'group.com.tktcorporation.goodmorning';

/**
 * expo-alarm-kit ネイティブモジュールを遅延ロードして Layer を構築する。
 * ネイティブモジュールが利用不可の場合は AlarmKitUnavailableError で失敗する。
 */
export const AlarmKitLive = Layer.effect(
  AlarmKit,
  Effect.gen(function* () {
    let kit: ReturnType<typeof require> | null = null;
    try {
      kit = require('expo-alarm-kit');
    } catch {
      // Layer 構築自体は成功させ、各操作で UnavailableError を返す
    }

    /**
     * kit が null でないことを保証するヘルパー。
     * null の場合は AlarmKitUnavailableError で失敗する。
     */
    const requireKit = Effect.gen(function* () {
      if (kit === null) {
        return yield* Effect.fail(
          new AlarmKitUnavailableError({ message: 'Native module not available' }),
        );
      }
      // biome-ignore lint/suspicious/noExplicitAny: expo-alarm-kit has no exported type for the module
      return kit as any;
    });

    return AlarmKit.of({
      initialize: Effect.gen(function* () {
        const k = yield* requireKit;
        const configured = k.configure(APP_GROUP_ID);
        if (!configured) {
          return yield* Effect.fail(new AlarmKitOperationError({ operation: 'configure' }));
        }
        const status = (yield* Effect.promise(() => k.requestAuthorization())) as string;
        return status === 'authorized' ? ('authorized' as const) : ('denied' as const);
      }),

      checkLaunchPayload: Effect.sync(() => {
        if (kit === null) return null;
        return kit.getLaunchPayload() as { alarmId: string; payload: string | null } | null;
      }),

      scheduleRepeatingAlarm: (params) =>
        Effect.gen(function* () {
          const k = yield* requireKit;
          const result = (yield* Effect.tryPromise({
            try: () =>
              k.scheduleRepeatingAlarm({
                ...params,
                launchAppOnDismiss: true,
              }),
            catch: (cause) =>
              new AlarmKitOperationError({ operation: 'scheduleRepeatingAlarm', cause }),
          })) as boolean;
          return result;
        }),

      scheduleAlarm: (params) =>
        Effect.gen(function* () {
          const k = yield* requireKit;
          const result = (yield* Effect.tryPromise({
            try: () =>
              k.scheduleAlarm({
                ...params,
                launchAppOnDismiss: true,
              }),
            catch: (cause) => new AlarmKitOperationError({ operation: 'scheduleAlarm', cause }),
          })) as boolean;
          return result;
        }),

      cancelAlarm: (id) =>
        Effect.gen(function* () {
          const k = yield* requireKit;
          yield* Effect.tryPromise({
            try: () => k.cancelAlarm(id),
            catch: (cause) => new AlarmKitOperationError({ operation: 'cancelAlarm', cause }),
          });
        }),

      getAllAlarms: Effect.sync(() => {
        if (kit === null) return [];
        return kit.getAllAlarms() as string[];
      }),

      generateUUID: Effect.sync(() => {
        if (kit === null) return `fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        return kit.generateUUID() as string;
      }),

      syncWidgetData: (json) =>
        Effect.gen(function* () {
          if (kit === null) return;
          const fn = (kit as Record<string, unknown>).syncWidgetData;
          if (typeof fn !== 'function') return;
          yield* Effect.tryPromise({
            try: () => (fn as (groupId: string, json: string) => Promise<void>)(APP_GROUP_ID, json),
            catch: (cause) => new AlarmKitOperationError({ operation: 'syncWidgetData', cause }),
          });
        }),

      reloadWidgetTimelines: Effect.gen(function* () {
        if (kit === null) return;
        const fn = (kit as Record<string, unknown>).reloadWidgetTimelines;
        if (typeof fn !== 'function') return;
        yield* Effect.tryPromise({
          try: () => (fn as () => Promise<void>)(),
          catch: (cause) =>
            new AlarmKitOperationError({ operation: 'reloadWidgetTimelines', cause }),
        });
      }),

      setSnoozeSoundName: (name) =>
        Effect.sync(() => {
          if (kit === null) return;
          const fn = (kit as Record<string, unknown>).setSnoozeSoundName;
          if (typeof fn !== 'function') return;
          try {
            (fn as (name: string | null) => void)(name ?? null);
          } catch {
            // no-op: setSnoozeSoundName is best-effort
          }
        }),

      getSnoozeAlarmIds: Effect.sync(() => {
        if (kit === null) return [];
        const fn = (kit as Record<string, unknown>).getSnoozeAlarmIds;
        if (typeof fn !== 'function') return [];
        try {
          return (fn as () => string[])();
        } catch {
          return [];
        }
      }),

      clearSnoozeAlarmIds: Effect.sync(() => {
        if (kit === null) return;
        const fn = (kit as Record<string, unknown>).clearSnoozeAlarmIds;
        if (typeof fn !== 'function') return;
        try {
          (fn as () => void)();
        } catch {
          // no-op
        }
      }),

      getDismissEvents: Effect.sync(() => {
        if (kit === null) return [];
        const fn = (kit as Record<string, unknown>).getDismissEvents;
        if (typeof fn !== 'function') return [];
        try {
          return (fn as () => { alarmId: string; dismissedAt: string; payload: string }[])();
        } catch {
          return [];
        }
      }),

      clearDismissEvents: Effect.sync(() => {
        if (kit === null) return;
        const fn = (kit as Record<string, unknown>).clearDismissEvents;
        if (typeof fn !== 'function') return;
        try {
          (fn as () => void)();
        } catch {
          // no-op
        }
      }),

      startLiveActivity: (todos, snoozeEpoch) =>
        Effect.gen(function* () {
          if (kit === null) return null;
          const fn = (kit as Record<string, unknown>).startLiveActivity;
          if (typeof fn !== 'function') return null;
          const result = yield* Effect.tryPromise({
            try: () =>
              (fn as (todos: object[], epoch: number | null) => Promise<string | null>)(
                todos.map((t) => ({ id: t.id, title: t.title, completed: t.completed })),
                snoozeEpoch,
              ),
            catch: (cause) => new AlarmKitOperationError({ operation: 'startLiveActivity', cause }),
          });
          return result ?? null;
        }),

      updateLiveActivity: (activityId, todos, snoozeEpoch) =>
        Effect.gen(function* () {
          if (kit === null) return;
          const fn = (kit as Record<string, unknown>).updateLiveActivity;
          if (typeof fn !== 'function') return;
          yield* Effect.tryPromise({
            try: () =>
              (fn as (id: string, todos: object[], epoch: number | null) => Promise<boolean>)(
                activityId,
                todos.map((t) => ({ id: t.id, title: t.title, completed: t.completed })),
                snoozeEpoch,
              ),
            catch: (cause) =>
              new AlarmKitOperationError({ operation: 'updateLiveActivity', cause }),
          });
        }),

      endLiveActivity: (activityId) =>
        Effect.gen(function* () {
          if (kit === null) return;
          const fn = (kit as Record<string, unknown>).endLiveActivity;
          if (typeof fn !== 'function') return;
          yield* Effect.tryPromise({
            try: () => (fn as (id: string) => Promise<boolean>)(activityId),
            catch: (cause) => new AlarmKitOperationError({ operation: 'endLiveActivity', cause }),
          });
        }),
    });
  }),
);
