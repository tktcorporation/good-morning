/**
 * ストリーク（連続達成日数）とフリーズ残数を表示するバッジコンポーネント。
 *
 * 背景: ダッシュボードと日次レビューで現在のストリーク状態を一目で確認できるようにするため。
 * フリーズ残数も並べて表示し、poor な日に備えた「保険」があるかを示す。
 *
 * 呼び出し元: DailyGradeSection, app/(tabs)/index.tsx
 * ストリーク機能が不要になれば削除可能。
 */

import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../../constants/theme';

interface StreakBadgeProps {
  /** 現在の連続達成日数 */
  readonly currentStreak: number;
  /** 残りフリーズ回数（0〜2） */
  readonly freezesAvailable: number;
}

/**
 * ストリーク日数とフリーズ残数を横並びで表示するバッジ。
 * surface 背景 + rounded で周囲のカードと馴染むデザイン。
 */
export function StreakBadge({ currentStreak, freezesAvailable }: StreakBadgeProps) {
  const { t } = useTranslation('dashboard');

  return (
    <View style={styles.container}>
      <View style={styles.streakSection}>
        <Text style={styles.fireEmoji}>{'\uD83D\uDD25'}</Text>
        <Text style={styles.streakText}>{t('streak.current', { count: currentStreak })}</Text>
      </View>
      <View style={styles.freezeSection}>
        <Text style={styles.freezeEmoji}>{'\uD83E\uDDCA'}</Text>
        <Text style={styles.freezeText}>{t('grade.freezeCount', { count: freezesAvailable })}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.lg,
  },
  streakSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  fireEmoji: {
    fontSize: fontSize.lg,
  },
  streakText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  freezeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  freezeEmoji: {
    fontSize: fontSize.md,
  },
  freezeText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
});
