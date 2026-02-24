import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../../constants/theme';
import type { DailySummary } from '../../hooks/useDailySummary';
import { initHealthKit } from '../../services/health';
import { useSettingsStore } from '../../stores/settings-store';
import { SleepTimelineBar } from './SleepTimelineBar';

interface SleepCardProps {
  readonly summary: DailySummary;
}

function formatTimeFromIso(isoString: string): string {
  const date = new Date(isoString);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

export function SleepCard({ summary }: SleepCardProps) {
  const { t } = useTranslation('stats');
  const healthKitEnabled = useSettingsStore((s) => s.healthKitEnabled);
  const setHealthKitEnabled = useSettingsStore((s) => s.setHealthKitEnabled);

  const handleConnect = useCallback(async () => {
    const success = await initHealthKit();
    if (success) {
      await setHealthKitEnabled(true);
    }
  }, [setHealthKitEnabled]);

  // Not connected to HealthKit
  if (!healthKitEnabled) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{t('healthKit.sleep.lastNight')}</Text>
        <Pressable style={styles.connectButton} onPress={handleConnect}>
          <Text style={styles.connectButtonText}>{t('healthKit.sleep.connect')}</Text>
        </Pressable>
      </View>
    );
  }

  // Loading
  if (summary.loading) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{t('healthKit.sleep.lastNight')}</Text>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // No sleep data
  if (summary.sleep === null) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{t('healthKit.sleep.lastNight')}</Text>
        <Text style={styles.noDataText}>{t('healthKit.sleep.noData')}</Text>
      </View>
    );
  }

  // Has sleep data - show timeline + summary
  const { sleep, record } = summary;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('healthKit.sleep.lastNight')}</Text>
        <Text style={styles.durationText}>
          {t('healthKit.sleep.hours', { h: Math.floor(sleep.totalMinutes / 60), m: sleep.totalMinutes % 60 })}
        </Text>
      </View>

      <SleepTimelineBar
        bedtime={new Date(sleep.bedtime)}
        wakeTime={new Date(sleep.wakeUpTime)}
        targetTime={record?.targetTime ?? null}
        dismissedAt={record?.dismissedAt != null ? new Date(record.dismissedAt) : null}
        compact
      />

      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>
          {t('healthKit.sleep.bedtime')}{' '}
          <Text style={styles.summaryValue}>{formatTimeFromIso(sleep.bedtime)}</Text>
        </Text>
        <Text style={styles.summaryLabel}>
          {t('healthKit.sleep.wakeTime')}{' '}
          <Text style={styles.summaryValue}>{formatTimeFromIso(sleep.wakeUpTime)}</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  durationText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  summaryValue: {
    color: colors.text,
    fontWeight: '600',
  },
  noDataText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  connectButton: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  connectButtonText: {
    color: colors.primaryLight,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
