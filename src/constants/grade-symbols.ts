/**
 * DailyGrade の表示シンボルと色の定義。
 *
 * 背景: GradeIcon コンポーネントやテストから参照するグレードのシンボルマッピング。
 * react-native に依存しない純粋な定数ファイルにすることで、
 * node テスト環境からも直接 import できる。
 *
 * 呼び出し元: src/components/grade/GradeIcon.tsx, src/__tests__/grade-icon.test.ts
 * DailyGrade 型が変更されたらこのマッピングも更新が必要。
 */

import type { DailyGrade } from '../types/daily-grade';

/**
 * DailyGrade → 表示シンボルのマッピング。
 * 日本語由来の記号を採用: ◎(二重丸=最高) ○(丸=良) △(三角=普通) ×(バツ=悪)。
 * iOSでの視認性と日本ユーザーの直感的理解を優先した。
 */
export const GRADE_SYMBOLS: Readonly<Record<DailyGrade, string>> = {
  excellent: '\u25CE',
  good: '\u25CB',
  fair: '\u25B3',
  poor: '\u00D7',
};

/** グレード未確定時に表示する中黒ドット */
export const UNDETERMINED_SYMBOL = '\u30FB';

/**
 * DailyGrade ごとの表示色。
 * グレードアイコンやカレンダードットなど、グレードの視覚表現に使用する。
 * excellent は primary（アプリのアクセントカラー）で「最高」を強調。
 *
 * 値は theme.ts の colors.primary と同期する必要がある。
 * theme.ts 側にも GRADE_COLORS を定義しているが、こちらは react-native 非依存で
 * テストから参照しやすいようにしている。
 */
export const GRADE_COLORS_MAP: Readonly<Record<DailyGrade, string>> = {
  excellent: '#e94560',
  good: '#4CAF50',
  fair: '#FF9800',
  poor: '#F44336',
};

/** グレード未確定時（データ不足・翌朝待ち）の表示色 */
export const GRADE_UNDETERMINED_COLOR_VALUE = '#9E9E9E';
