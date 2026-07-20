/**
 * HealthKit（@kingstinct/react-native-healthkit）を抽象化する Effect サービス。
 *
 * 背景: 他のネイティブブリッジ（AlarmKit/Notification/Storage）は Effect サービスとして
 * 統一済みだが、health.ts だけ async/await + try-catch のまま個別にエラーを握り潰していた。
 * Effect サービスとして定義することで、権限取得・クエリの失敗が HealthKitError として
 * 型追跡され、呼び出し元（health.ts）が明示的にハンドリング戦略を選べる。
 *
 * health.ts / health.web.ts のプラットフォーム別解決を壊さないため、このサービスは
 * health.ts からのみ import する（services/index.ts の共有バレル・AppLayer には
 * 統合しない）。health.web.ts は元々このサービスに依存せず独立した no-op 実装のため、
 * Web 用スタブは不要（health.ts 自体が Web バンドルには含まれない）。
 *
 * 呼び出し元: health.ts
 */

import {
  isHealthDataAvailable,
  queryCategorySamples,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import { Context, Effect, Layer } from 'effect';
import { HealthKitError } from './errors';

/** queryCategorySamples の実際の戻り値型から要素型を導出する（ライブラリ側の型とズレない）。 */
type SleepCategorySample = Awaited<
  ReturnType<typeof queryCategorySamples<'HKCategoryTypeIdentifierSleepAnalysis'>>
>[number];

export interface HealthKitService {
  readonly isAvailable: Effect.Effect<boolean>;
  readonly requestSleepAuthorization: Effect.Effect<boolean, HealthKitError>;
  readonly querySleepSamples: (range: {
    readonly startDate: Date;
    readonly endDate: Date;
  }) => Effect.Effect<readonly SleepCategorySample[], HealthKitError>;
}

export class HealthKit extends Context.Tag('HealthKit')<HealthKit, HealthKitService>() {}

export const HealthKitLive = Layer.succeed(
  HealthKit,
  HealthKit.of({
    isAvailable: Effect.sync(() => isHealthDataAvailable()),

    requestSleepAuthorization: Effect.tryPromise({
      try: () => requestAuthorization({ toRead: ['HKCategoryTypeIdentifierSleepAnalysis'] }),
      catch: (cause) => new HealthKitError({ operation: 'init', cause }),
    }),

    querySleepSamples: (range) =>
      Effect.tryPromise({
        try: () =>
          queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
            limit: 0, // 0 = 全サンプル取得
            ascending: true,
            filter: { date: range },
          }),
        catch: (cause) => new HealthKitError({ operation: 'query', cause }),
      }),
  }),
);
