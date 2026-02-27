import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, commonStyles, fontSize, spacing } from '../../constants/theme';
import type { DailySummary } from '../../hooks/useDailySummary';
import { useSettingsStore } from '../../stores/settings-store';
import { SleepTimelineBar } from './SleepTimelineBar';

interface SleepDetailSectionProps {
  readonly summary: DailySummary;
}

function splitDuration(totalMinutes: number): { h: number; m: number } {
  return { h: Math.floor(totalMinutes / 60), m: totalMinutes % 60 };
}

function formatTimeFromIso(isoString: string): string {
  const date = new Date(isoString);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

/**
 * 日別レビュー画面で HealthKit の睡眠データを表示するセクション。
 *
 * healthKitEnabled=false の場合はセクション自体を非表示にする。
 * ユーザーが HealthKit を連携していないのに「データなし」と表示すると、
 * 「何か壊れている？」という誤解を招くため。
 */
export function SleepDetailSection({ summary }: SleepDetailSectionProps) {
  const { t } = useTranslation('stats');
  const healthKitEnabled = useSettingsStore((s) => s.healthKitEnabled);

  // HealthKit 未連携時はセクション自体を表示しない
  if (!healthKitEnabled) {
    return null;
  }

  // Loading
  if (summary.loading) {
    return (
      <View style={styles.section}>
        <Text style={commonStyles.sectionTitle}>{t('healthKit.sleep.title')}</Text>
        <View style={styles.content}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  // No sleep data — HealthKit は有効だがデータがない。
  // 権限が取り消された可能性があるため、ヒントで設定確認を促す。
  if (summary.sleep === null) {
    return (
      <View style={styles.section}>
        <Text style={commonStyles.sectionTitle}>{t('healthKit.sleep.title')}</Text>
        <View style={styles.content}>
          <Text style={styles.noDataText}>{t('healthKit.sleep.noData')}</Text>
          <Text style={styles.noDataHintText}>{t('healthKit.noDataHint')}</Text>
        </View>
      </View>
    );
  }

  const { sleep, record } = summary;

  return (
    <View style={styles.section}>
      <Text style={commonStyles.sectionTitle}>{t('healthKit.sleep.title')}</Text>

      <View style={styles.content}>
        {/* Timeline bar (full size) */}
        <SleepTimelineBar
          bedtime={new Date(sleep.bedtime)}
          wakeTime={new Date(sleep.wakeUpTime)}
          targetTime={record?.targetTime ?? null}
          dismissedAt={record?.dismissedAt != null ? new Date(record.dismissedAt) : null}
        />

        {/* Detail rows */}
        <View style={styles.detailRows}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('healthKit.sleep.bedtime')}</Text>
            <Text style={styles.detailValue}>{formatTimeFromIso(sleep.bedtime)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('healthKit.sleep.wakeTime')}</Text>
            <Text style={styles.detailValue}>{formatTimeFromIso(sleep.wakeUpTime)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('healthKit.sleep.duration')}</Text>
            <Text style={styles.detailValue}>
              {t('healthKit.sleep.hours', splitDuration(sleep.totalMinutes))}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
  },
  content: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  detailRows: {
    marginTop: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  detailLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  detailValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  noDataText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingTop: spacing.lg,
  },
  noDataHintText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
  },
});
