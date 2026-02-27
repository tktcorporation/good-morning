/**
 * DailyGrade を1文字のシンボルで表現するアイコンコンポーネント。
 *
 * 背景: ダッシュボードの週間カレンダーや日次レビュー画面でグレードを一目で識別するため。
 * 文字ベース（◎○△×）にすることで、画像アセット不要かつカラーテーマとの組み合わせが容易。
 *
 * 呼び出し元: DailyGradeSection, app/(tabs)/index.tsx (WeeklyCalendar)
 * DailyGrade 型が変更されたら GRADE_SYMBOLS も合わせて更新が必要。
 */

import { StyleSheet, Text } from 'react-native';
import { GRADE_SYMBOLS, UNDETERMINED_SYMBOL } from '../../constants/grade-symbols';
import { GRADE_COLORS, GRADE_UNDETERMINED_COLOR } from '../../constants/theme';
import type { DailyGrade } from '../../types/daily-grade';

interface GradeIconProps {
  /** 表示するグレード。null の場合は未確定ドットを表示する */
  readonly grade: DailyGrade | null;
  /** フォントサイズ（デフォルト: 24） */
  readonly size?: number;
}

/**
 * グレードに対応するシンボル文字を色付きで表示する。
 * grade=null の場合はグレーの中黒ドット（・）を表示して「未確定」を示す。
 */
export function GradeIcon({ grade, size = 24 }: GradeIconProps) {
  const symbol = grade !== null ? GRADE_SYMBOLS[grade] : UNDETERMINED_SYMBOL;
  const color = grade !== null ? GRADE_COLORS[grade] : GRADE_UNDETERMINED_COLOR;

  return <Text style={[styles.icon, { fontSize: size, color }]}>{symbol}</Text>;
}

const styles = StyleSheet.create({
  icon: {
    textAlign: 'center',
    lineHeight: undefined,
  },
});
