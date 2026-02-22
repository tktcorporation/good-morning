import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../../constants/theme';

interface StreakDisplayProps {
  readonly currentStreak: number;
  readonly longestStreak: number;
}

export function StreakDisplay({ currentStreak, longestStreak }: StreakDisplayProps) {
  const { t } = useTranslation('stats');

  return (
    <View style={styles.container}>
      <View style={styles.currentStreakSection}>
        <Text style={styles.streakValue}>{`${currentStreak}`}</Text>
        <Text style={styles.streakUnit}>{t('days')}</Text>
        <Text style={styles.streakLabel}>{t('streak')}</Text>
      </View>
      <View style={styles.longestSection}>
        <Text style={styles.longestLabel}>{t('longestStreak')}</Text>
        <Text style={styles.longestValue}>{`${longestStreak} ${t('days')}`}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  currentStreakSection: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  streakValue: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.success,
    fontVariant: ['tabular-nums'],
  },
  streakUnit: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: -spacing.xs,
  },
  streakLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  longestSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    width: '100%',
    justifyContent: 'center',
  },
  longestLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  longestValue: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '600',
  },
});
