/**
 * AsyncStorage へのアクセスを抽象化する Effect サービス。
 *
 * 背景: 全ストアが AsyncStorage を直接 import し、エラーを個別に（or 無視して）処理していた。
 * Effect サービスとして定義することで：
 * - 読み書きのエラーが StorageError として型追跡される
 * - テスト時に InMemory 実装に差し替え可能
 * - JSON パース失敗も適切にハンドリングされる
 *
 * 呼び出し元: 全 Zustand ストア（将来的にストアの persist を Effect 経由に移行する際に使用）
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Context, Effect, Layer } from 'effect';
import { StorageError } from './errors';

// ─── サービスインターフェース ────────────────────────────────────

export interface StorageService {
  /** キーに対応する値を取得。存在しない場合は null */
  readonly get: (key: string) => Effect.Effect<string | null, StorageError>;
  /** キーに値を保存 */
  readonly set: (key: string, value: string) => Effect.Effect<void, StorageError>;
  /** キーを削除 */
  readonly remove: (key: string) => Effect.Effect<void, StorageError>;
}

export class Storage extends Context.Tag('Storage')<Storage, StorageService>() {}

// ─── AsyncStorage 実装 Layer ────────────────────────────────────

export const StorageLive = Layer.succeed(
  Storage,
  Storage.of({
    get: (key) =>
      Effect.tryPromise({
        try: () => AsyncStorage.getItem(key),
        catch: (cause) => new StorageError({ operation: 'read', key, cause }),
      }),

    set: (key, value) =>
      Effect.tryPromise({
        try: () => AsyncStorage.setItem(key, value),
        catch: (cause) => new StorageError({ operation: 'write', key, cause }),
      }),

    remove: (key) =>
      Effect.tryPromise({
        try: () => AsyncStorage.removeItem(key),
        catch: (cause) => new StorageError({ operation: 'remove', key, cause }),
      }),
  }),
);
