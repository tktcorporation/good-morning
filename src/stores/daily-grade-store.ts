/**
 * Daily Grade の記録とストリーク状態を管理するストア。
 *
 * 背景: Daily Grade & Streak System のデータ永続化レイヤー。
 * DailyGradeRecord はアラーム解除 + 翌朝の HealthKit データから確定する。
 * StreakState はグレード確定時に applyGradeToStreak で自動更新される。
 *
 * WakeRecordStore とは別管理。WakeRecord はアラーム解除時に即座に作成されるが、
 * DailyGradeRecord は夜の就寝データが揃ってから（翌朝に）確定する。
 */

import { Effect, Either, Schema } from 'effect';
import { create } from 'zustand';
import { STORAGE_KEYS } from '../constants/storage-keys';
import { applyGradeToStreak } from '../domain/grade-calculator';
import {
  asRecord,
  decodeFieldOrDefault,
  decodeStoredJson,
  runEffect,
  runEffectFork,
  Storage,
  syncWidgetEffect,
  unknownArrayGate,
} from '../services';
import type { StorageError } from '../services/errors';
import type { DailyGradeRecord } from '../types/daily-grade';
import type { StreakState } from '../types/streak';
import { logError, logWarn } from '../utils/logger';

const GRADES_STORAGE_KEY = STORAGE_KEYS.dailyGrades;
const STREAK_STORAGE_KEY = STORAGE_KEYS.streakState;

/**
 * ストリークの初期状態。
 * 初回起動時やデータリセット時に使用される。テストでも初期値として参照する。
 */
export const INITIAL_STREAK_STATE: StreakState = {
  currentStreak: 0,
  longestStreak: 0,
  freezesAvailable: 0,
  freezesUsedTotal: 0,
  lastGradedDate: null,
};

const DailyGradeSchema = Schema.Literal('excellent', 'good', 'fair', 'poor');
const BedtimeResultSchema = Schema.Literal('onTime', 'late', 'noData');

/**
 * 永続化済み DailyGradeRecord を要素単位で寛容にデコードする。date/grade は
 * レコードを識別・成立させるための最小限のフィールドのため欠落・型不一致なら
 * レコードごと破棄する（呼び出し元が配列から除外）。それ以外のフィールドは
 * decodeFieldOrDefault でフィールド単位のデフォルト補完に倒し、1フィールドの
 * 破損で他の正常なレコード・フィールドまで失わないようにする。
 */
function decodeDailyGradeRecord(raw: unknown): DailyGradeRecord | null {
  const obj = asRecord(raw);
  const dateResult = Schema.decodeUnknownEither(Schema.String)(obj.date);
  const gradeResult = Schema.decodeUnknownEither(DailyGradeSchema)(obj.grade);
  if (Either.isLeft(dateResult) || Either.isLeft(gradeResult)) return null;

  return {
    date: dateResult.right,
    grade: gradeResult.right,
    morningPass: decodeFieldOrDefault(Schema.Boolean, obj.morningPass, false),
    bedtimeResult: decodeFieldOrDefault(BedtimeResultSchema, obj.bedtimeResult, 'noData'),
    bedtimeTarget: decodeFieldOrDefault(Schema.NullOr(Schema.String), obj.bedtimeTarget, null),
    actualBedtime: decodeFieldOrDefault(Schema.NullOr(Schema.String), obj.actualBedtime, null),
  };
}

/** 永続化済み grades 配列をデコードする。個々のレコードが不正な形状でも配列全体は破棄しない。 */
function decodeGrades(decoded: readonly unknown[]): readonly DailyGradeRecord[] {
  const records: DailyGradeRecord[] = [];
  for (const raw of decoded) {
    const record = decodeDailyGradeRecord(raw);
    if (record !== null) {
      records.push(record);
    } else {
      logWarn('daily-grade-store', '不正な形状の DailyGradeRecord をスキップしました', raw);
    }
  }
  return records;
}

/**
 * 永続化済み StreakState をフィールド単位で寛容にデコードする。
 * Schema.Struct の一括デコードは1フィールドの型不一致で構造体全体を失敗させ、
 * 他の正常なフィールド（longestStreak 等の積み上げてきた実績）まで巻き添えで
 * デフォルト値に上書きしてしまうため、decodeFieldOrDefault でフィールドごとに
 * 独立してデコードする。
 */
function decodeStreakState(parsed: unknown): StreakState {
  const obj = asRecord(parsed);
  return {
    currentStreak: decodeFieldOrDefault(
      Schema.Number,
      obj.currentStreak,
      INITIAL_STREAK_STATE.currentStreak,
    ),
    longestStreak: decodeFieldOrDefault(
      Schema.Number,
      obj.longestStreak,
      INITIAL_STREAK_STATE.longestStreak,
    ),
    freezesAvailable: decodeFieldOrDefault(
      Schema.Number,
      obj.freezesAvailable,
      INITIAL_STREAK_STATE.freezesAvailable,
    ),
    freezesUsedTotal: decodeFieldOrDefault(
      Schema.Number,
      obj.freezesUsedTotal,
      INITIAL_STREAK_STATE.freezesUsedTotal,
    ),
    lastGradedDate: decodeFieldOrDefault(
      Schema.NullOr(Schema.String),
      obj.lastGradedDate,
      INITIAL_STREAK_STATE.lastGradedDate,
    ),
  };
}

interface DailyGradeState {
  readonly grades: readonly DailyGradeRecord[];
  readonly streak: StreakState;
  readonly loaded: boolean;

  /** AsyncStorage からグレード履歴とストリーク状態を読み込む */
  loadGrades: () => Promise<void>;

  /**
   * 新しい DailyGradeRecord を追加し、ストリークを更新する。
   * 同じ日付のレコードが既に存在する場合は上書きする（再評価ケース）。
   * applyGradeToStreak を呼んでストリーク/フリーズを自動更新し、
   * 両方を AsyncStorage に永続化する。
   *
   * 冪等性ガード: 追加する日付が streak.lastGradedDate と同じ場合、
   * ストリーク計算を再適用しない。これにより同じ日のグレードを
   * 上書き更新してもストリークが二重加算されることを防ぐ。
   */
  addGrade: (record: DailyGradeRecord) => Promise<void>;

  /** 特定の日付のグレードレコードを取得 */
  getGradeForDate: (date: string) => DailyGradeRecord | undefined;

  /** 指定期間のグレードレコードを取得（WeeklyCalendar 用） */
  getGradesForPeriod: (startDate: string, endDate: string) => readonly DailyGradeRecord[];
}

/**
 * grades と streak の両方を AsyncStorage に永続化するヘルパー。
 * addGrade のたびに2つのキーを書き込む必要があるため共通化。
 */
function persistAll(grades: readonly DailyGradeRecord[], streak: StreakState): Promise<void> {
  return runEffect(
    Storage.pipe(
      Effect.flatMap((storage) =>
        Effect.all(
          [
            storage.set(GRADES_STORAGE_KEY, JSON.stringify(grades)),
            storage.set(STREAK_STORAGE_KEY, JSON.stringify(streak)),
          ],
          { concurrency: 'unbounded' },
        ),
      ),
      Effect.asVoid,
    ),
  );
}

/**
 * grades と streak を並行して読み取り、デコードする Effect。
 * 読み取り自体の失敗（StorageError）はそのまま呼び出し元に伝播させる。
 * JSON パース失敗（未設定含む）は grades を空配列、streak を INITIAL_STREAK_STATE に
 * フォールバックし、JSON としては読めたがフィールド単位で不整合がある場合は
 * decodeGrades/decodeStreakState が個別の要素・フィールドのみフォールバックする。
 */
function loadGradesEffect(): Effect.Effect<
  { grades: readonly DailyGradeRecord[]; streak: StreakState },
  StorageError,
  Storage
> {
  return Storage.pipe(
    Effect.flatMap((storage) =>
      Effect.all(
        {
          grades: storage.get(GRADES_STORAGE_KEY).pipe(
            Effect.flatMap((raw) => decodeStoredJson(GRADES_STORAGE_KEY, unknownArrayGate, raw)),
            Effect.map((decoded) => (decoded === null ? [] : decodeGrades(decoded))),
            Effect.catchTag('StorageDecodeError', () =>
              Effect.succeed<readonly DailyGradeRecord[]>([]),
            ),
          ),
          streak: storage.get(STREAK_STORAGE_KEY).pipe(
            Effect.flatMap((raw) => decodeStoredJson(STREAK_STORAGE_KEY, Schema.Unknown, raw)),
            Effect.map((decoded) =>
              decoded === null ? INITIAL_STREAK_STATE : decodeStreakState(decoded),
            ),
            Effect.catchTag('StorageDecodeError', () => Effect.succeed(INITIAL_STREAK_STATE)),
          ),
        },
        { concurrency: 'unbounded' },
      ),
    ),
  );
}

export const useDailyGradeStore = create<DailyGradeState>((set, get) => ({
  grades: [],
  streak: INITIAL_STREAK_STATE,
  loaded: false,

  loadGrades: async () => {
    // 読み取り自体の失敗（StorageError、リトライしても解決しない）は grades/streak
    // どちらの実データも確認できていない。loaded=false のまま留めて再試行
    // （アプリ再起動等）に委ねる — 他ストアと同じ方針。
    try {
      const { grades, streak } = await runEffect(loadGradesEffect());
      set({ grades, streak, loaded: true });
    } catch (error) {
      logError('daily-grade-store', 'loadGrades failed after retries', error);
    }
  },

  addGrade: async (record: DailyGradeRecord) => {
    const { grades, streak } = get();

    // 同じ日付のレコードがあれば除外して新しいレコードで置き換える
    const filtered = grades.filter((g) => g.date !== record.date);
    const updatedGrades = [...filtered, record];

    // 冪等性ガード: lastGradedDate と同じ日付なら streak を再計算しない。
    // 同じ日のグレードを上書き更新するケース（再評価）では、
    // 最初の addGrade 時に streak が更新済みなので二重適用を防ぐ。
    const updatedStreak =
      streak.lastGradedDate === record.date
        ? streak
        : applyGradeToStreak(streak, record.grade, record.date);

    set({ grades: updatedGrades, streak: updatedStreak });
    await persistAll(updatedGrades, updatedStreak);
    // ウィジェットにストリーク更新を反映（fire-and-forget）
    runEffectFork(syncWidgetEffect);
  },

  getGradeForDate: (date: string) => {
    return get().grades.find((g) => g.date === date);
  },

  getGradesForPeriod: (startDate: string, endDate: string) => {
    // YYYY-MM-DD 形式の文字列比較で日付範囲をフィルタリング。
    // ISO 8601 の日付文字列は辞書順で正しく比較できる。
    return get().grades.filter((g) => g.date >= startDate && g.date <= endDate);
  },
}));
