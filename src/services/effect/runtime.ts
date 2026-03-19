/**
 * Effect ランタイムの構築と実行ユーティリティ。
 *
 * 背景: Effect プログラムを実行するには ManagedRuntime が必要。
 * 全サービスの Layer を合成して1つのランタイムを作り、
 * アプリ全体で共有する。
 *
 * runEffect() は Effect プログラムを Promise に変換するヘルパーで、
 * 既存の async/await コードからの段階的移行を可能にする。
 *
 * 設計:
 * - Layer 合成で依存関係が自動解決される
 * - ランタイムは遅延初期化（初回 runEffect 時に構築）
 * - テスト時は TestLayer を渡して runEffect を使う
 */

import { type Effect, Layer, ManagedRuntime } from 'effect';
import { type AlarmKit, AlarmKitLive } from './AlarmKitService';
import { type Notification, NotificationLive } from './NotificationService';
import { type Sound, SoundLive } from './SoundService';
import { type Storage, StorageLive } from './StorageService';

// ─── Layer 合成 ────────────────────────────────────────────────

/**
 * 全サービスを結合した Layer。
 * アプリケーションの全依存関係がここに集約される。
 */
export const AppLayer = Layer.mergeAll(AlarmKitLive, StorageLive, NotificationLive, SoundLive);

/** AppLayer が提供するサービスの型 */
export type AppServices = AlarmKit | Storage | Notification | Sound;

// ─── ランタイム ────────────────────────────────────────────────

/**
 * アプリ全体で共有する ManagedRuntime。
 * Layer の合成結果をキャッシュし、サービスの初期化を1度だけ行う。
 */
const appRuntime = ManagedRuntime.make(AppLayer);

/**
 * Effect プログラムを実行して Promise を返すヘルパー。
 *
 * 既存の async/await コードからの段階的移行に使用する。
 * Effect プログラム内のエラーは cause に包まれて reject される。
 *
 * 使い方:
 * ```ts
 * const result = await runEffect(
 *   Effect.gen(function* () {
 *     const kit = yield* AlarmKit;
 *     yield* kit.initialize;
 *   })
 * );
 * ```
 */
export function runEffect<A, E>(effect: Effect.Effect<A, E, AppServices>): Promise<A> {
  return appRuntime.runPromise(effect);
}

/**
 * Effect プログラムを fire-and-forget で実行するヘルパー。
 * エラーは console.error に出力される（従来の `.catch(() => {})` の代替）。
 */
export function runEffectFork<A, E>(effect: Effect.Effect<A, E, AppServices>): void {
  appRuntime.runPromise(effect).catch((e) => {
    // biome-ignore lint/suspicious/noConsole: Effect runtime error logging
    console.error('[Effect Runtime]', e);
  });
}
