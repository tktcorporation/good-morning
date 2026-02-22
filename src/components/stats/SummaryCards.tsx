import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../../constants/theme';
import type { WakeStats } from '../../types/wake-record';

interface SummaryCardsProps {
  readonly stats: WakeStats;
}

function getSuccessRateColor(rate: number): string {
  if (rate >= 80) return colors.success;
  if (rate >= 50) return colors.warning;
  return colors.primary;
}

function formatDiffLabel(diff: number): 'onTime' | 'minutesLate' | 'minutesEarly' {
  const rounded = Math.round(Math.abs(diff));
  if (rounded === 0) return 'onTime';
  if (diff > 0) return 'minutesLate';
  return 'minutesEarly';
}

export function SummaryCards({ stats }: SummaryCardsProps) {
  const { t } = useTranslation('stats');

  const diffKey = formatDiffLabel(stats.averageDiffMinutes);
  const diffCount = Math.round(Math.abs(stats.averageDiffMinutes));
  const diffText = diffKey === 'onTime' ? t('onTime') : t(diffKey, { count: diffCount });

  return (
    <View style={styles.row}>
      <View style={styles.card}>
        <Text style={[styles.cardValue, { color: getSuccessRateColor(stats.successRate) }]}>
          {`${Math.round(stats.successRate)}%`}
        </Text>
        <Text style={styles.cardLabel}>{t('successRate')}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardValue}>{diffText}</Text>
        <Text style={styles.cardLabel}>{t('avgDiff')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  cardValue: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  cardLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
