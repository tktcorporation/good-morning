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

import { Effect, Schema } from 'effect';
import { create } from 'zustand';
import { STORAGE_KEYS } from '../constants/storage-keys';
import { applyGradeToStreak } from '../domain/grade-calculator';
import { decodeStoredJson, runEffect, runEffectFork, Storage, syncWidgetEffect } from '../services';
import type { StorageError } from '../services/errors';
import type { DailyGradeRecord } from '../types/daily-grade';
import type { StreakState } from '../types/streak';

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

/**
 * grades（DailyGradeRecord[]）は「トップレベルが配列であること」のみ検証する
 * ゲートに留める。要素ごとの厳密なスキーマ検証を導入すると、過去に保存された
 * レコードが将来のフィールド追加で弾かれ、月単位の実データを一括で失うリスクが
 * ある（wake-record と同じ判断）。
 */
const GradesGateSchema = Schema.Array(Schema.Unknown);

/** StreakState は全フィールドが単純なプリミティブで安定しているため、フィールド単位で検証・デフォルト補完する。 */
const StreakStateSchema = Schema.Struct({
  currentStreak: Schema.optionalWith(Schema.Number, {
    default: () => INITIAL_STREAK_STATE.currentStreak,
  }),
  longestStreak: Schema.optionalWith(Schema.Number, {
    default: () => INITIAL_STREAK_STATE.longestStreak,
  }),
  freezesAvailable: Schema.optionalWith(Schema.Number, {
    default: () => INITIAL_STREAK_STATE.freezesAvailable,
  }),
  freezesUsedTotal: Schema.optionalWith(Schema.Number, {
    default: () => INITIAL_STREAK_STATE.freezesUsedTotal,
  }),
  lastGradedDate: Schema.optionalWith(Schema.NullOr(Schema.String), {
    default: () => INITIAL_STREAK_STATE.lastGradedDate,
  }),
});

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
        Effect.all([
          storage.set(GRADES_STORAGE_KEY, JSON.stringify(grades)),
          storage.set(STREAK_STORAGE_KEY, JSON.stringify(streak)),
        ]),
      ),
      Effect.asVoid,
    ),
  );
}

/**
 * grades と streak を並行して読み取り、デコードする Effect。
 * 読み取り自体の失敗（StorageError）はそのまま呼び出し元に伝播させる。
 * データ破損（スキーマ不一致・JSON パース失敗）は grades を空配列、streak を
 * INITIAL_STREAK_STATE にフォールバックする（従来は try/catch が無く、
 * 破損データで loadGrades 全体が例外を投げていた）。
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
            Effect.flatMap((raw) => decodeStoredJson(GRADES_STORAGE_KEY, GradesGateSchema, raw)),
            Effect.map((decoded) => (decoded ?? []) as readonly DailyGradeRecord[]),
            Effect.catchTag('StorageDecodeError', () =>
              Effect.succeed<readonly DailyGradeRecord[]>([]),
            ),
          ),
          streak: storage.get(STREAK_STORAGE_KEY).pipe(
            Effect.flatMap((raw) => decodeStoredJson(STREAK_STORAGE_KEY, StreakStateSchema, raw)),
            Effect.map((decoded) => decoded ?? INITIAL_STREAK_STATE),
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
      // biome-ignore lint/suspicious/noConsole: 起動時初期化の失敗を握り潰さず可視化する
      console.error('[daily-grade-store] loadGrades failed after retries', error);
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
