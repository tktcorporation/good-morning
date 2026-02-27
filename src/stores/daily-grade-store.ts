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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { applyGradeToStreak } from '../services/grade-calculator';
import type { DailyGradeRecord } from '../types/daily-grade';
import type { StreakState } from '../types/streak';

const GRADES_STORAGE_KEY = 'daily-grades';
const STREAK_STORAGE_KEY = 'streak-state';

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
async function persistAll(grades: readonly DailyGradeRecord[], streak: StreakState): Promise<void> {
  await AsyncStorage.setItem(GRADES_STORAGE_KEY, JSON.stringify(grades));
  await AsyncStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(streak));
}

export const useDailyGradeStore = create<DailyGradeState>((set, get) => ({
  grades: [],
  streak: INITIAL_STREAK_STATE,
  loaded: false,

  loadGrades: async () => {
    const [rawGrades, rawStreak] = await Promise.all([
      AsyncStorage.getItem(GRADES_STORAGE_KEY),
      AsyncStorage.getItem(STREAK_STORAGE_KEY),
    ]);

    const grades: readonly DailyGradeRecord[] =
      rawGrades !== null ? (JSON.parse(rawGrades) as DailyGradeRecord[]) : [];

    const streak: StreakState =
      rawStreak !== null ? (JSON.parse(rawStreak) as StreakState) : INITIAL_STREAK_STATE;

    set({ grades, streak, loaded: true });
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

export type { DailyGradeState };
