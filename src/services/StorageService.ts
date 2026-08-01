/**
 * AsyncStorage へのアクセスを抽象化する Effect サービス。
 *
 * 背景: 全ストアが AsyncStorage を直接 import し、エラーを個別に（or 無視して）処理していた。
 * Effect サービスとして定義することで：
 * - 読み書きのエラーが StorageError として型追跡される
 * - テスト時に InMemory 実装に差し替え可能
 * - JSON パース失敗も適切にハンドリングされる
 *
 * 呼び出し元: 全 Zustand ストア（persist を Effect 経由に統一）
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Context, Effect, Either, Layer, Schedule, Schema } from 'effect';
import type { TodoType } from '../types/alarm';
import { StorageDecodeError, StorageError } from './errors';

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

/**
 * 読み取りのリトライ回数（初回 + 2 リトライ = 最大 3 回試行）。
 *
 * cold-start 直後はネイティブブリッジの初期化競合などで AsyncStorage.getItem が
 * 一時的に reject することがある。1 回の失敗だけで「読み取れない」と確定させると、
 * 実際にはストレージ上に残っている記録・設定を「存在しない」ものとして扱ってしまい、
 * その状態で永続化処理を進めると空データで実データを上書き消失させる。
 */
const READ_RETRY_SCHEDULE = Schedule.recurs(2);

// ─── AsyncStorage 実装 Layer ────────────────────────────────────

export const StorageLive = Layer.succeed(
  Storage,
  Storage.of({
    get: (key) =>
      Effect.tryPromise({
        try: () => AsyncStorage.getItem(key),
        catch: (cause) => new StorageError({ operation: 'read', key, cause }),
      }).pipe(Effect.retry(READ_RETRY_SCHEDULE)),

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

// ─── JSON デコードヘルパー ────────────────────────────────────

/**
 * Storage.get で読み取った JSON 文字列を Schema でデコードする。
 *
 * StorageError（読み取り自体の失敗）とは異なるエラーチャンネル（StorageDecodeError）
 * で「読み取りには成功したが中身が壊れている/期待した形状でない」ケースを表現する。
 * 呼び出し元はこの2つを区別して復旧戦略を選べる: StorageError は再試行に委ねて
 * loaded=false を維持すべきだが、StorageDecodeError はデータ破損が確定しているため
 * デフォルト値へのフォールバックが安全（=それ以上リトライしても解決しない）。
 *
 * raw が null（未設定）の場合は成功として null を返す。
 */
export function decodeStoredJson<A, I>(
  key: string,
  schema: Schema.Schema<A, I>,
  raw: string | null,
): Effect.Effect<A | null, StorageDecodeError> {
  if (raw === null) return Effect.succeed(null);
  return Effect.try({
    try: () => JSON.parse(raw) as unknown,
    catch: (cause) => new StorageDecodeError({ key, cause }),
  }).pipe(
    Effect.flatMap((parsed) =>
      Schema.decodeUnknown(schema)(parsed).pipe(
        Effect.mapError((cause) => new StorageDecodeError({ key, cause })),
      ),
    ),
  );
}

/**
 * JSON トップレベルが配列であることだけを検証するゲート。要素単位の形状検証は
 * 呼び出し元が個別に行う（decodeFieldOrDefault 等）。複数ストアの records/grades
 * 配列読み込みで共通に使うため、ここを SSOT とする。
 */
export const unknownArrayGate: Schema.Schema<readonly unknown[]> = Schema.Array(Schema.Unknown);

/**
 * 1フィールドを寛容にデコードする: 値が欠落・型不一致・その他デコード失敗の
 * いずれであっても例外を投げず defaultValue にフォールバックする。
 *
 * Schema.Struct によるオブジェクト全体の一括デコードは、1フィールドが型不一致
 * なだけで構造体全体を失敗させ、他の正常なフィールドまで巻き添えでデフォルト値に
 * 上書きしてしまう（Schema.optionalWith の default はキー欠落時にしか働かず、
 * 値が存在するが型が違うケースはカバーしない）。永続化データの1フィールド破損で
 * 他の正常なユーザーデータ（ストリーク・権限状態等）まで失わないよう、
 * オブジェクトはフィールドごとにこの関数でデコードすること。
 */
export function decodeFieldOrDefault<A, I>(
  schema: Schema.Schema<A, I>,
  value: unknown,
  defaultValue: A,
): A {
  const result = Schema.decodeUnknownEither(schema)(value);
  return Either.isRight(result) ? result.right : defaultValue;
}

/**
 * 本来 optional（型に `?`/`| undefined` を含む）なフィールドを寛容にデコードする。
 * 値が undefined ならそのまま undefined、デコードに失敗した場合も undefined に倒す
 * （decodeFieldOrDefault と異なり、フォールバック値を呼び出し側で指定する必要がない）。
 */
export function decodeOptionalField<A, I>(
  schema: Schema.Schema<A, I>,
  value: unknown,
): A | undefined {
  if (value === undefined) return undefined;
  const result = Schema.decodeUnknownEither(schema)(value);
  return Either.isRight(result) ? result.right : undefined;
}

/** 永続化データの unknown 値から、フィールド辞書として安全に扱える形を取り出す。オブジェクトでなければ空を返す。 */
export function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/**
 * 永続化データ中の TodoType を検証する共通スキーマ。複数ストア（wake-record,
 * morning-session）の永続化スキーマから共有する。TodoType（types/alarm.ts）に
 * 新しい種別を追加したときはここも合わせて更新すること。
 */
export const TodoTypeSchema: Schema.Schema<TodoType> = Schema.Literal('checkbox', 'squat', 'sky');
