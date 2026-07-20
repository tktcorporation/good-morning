/**
 * Effect 共通コンビネータ。
 *
 * 背景: セッション/アラーム系サービスには「後始末処理（キャンセル・Live Activity
 * 終了・リマインド通知解除等）の失敗を主処理の失敗として扱わず握りつぶす」という
 * 同じ意図の Effect.catchAll(() => Effect.void) が十数箇所に散在していた。
 * bestEffort という名前で意図を明示し、実装を1箇所に集約する。
 */

import { Effect } from 'effect';

/** 失敗を無視して void 化する。後始末の失敗を主処理に波及させたくない箇所で使う。 */
export function bestEffort<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<void, never, R> {
  return effect.pipe(
    Effect.catchAll(() => Effect.void),
    Effect.asVoid,
  );
}
