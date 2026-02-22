import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StreakDisplay } from '../../src/components/stats/StreakDisplay';
import { SummaryCards } from '../../src/components/stats/SummaryCards';
import { WeeklyCalendar } from '../../src/components/stats/WeeklyCalendar';
import { borderRadius, colors, fontSize, spacing } from '../../src/constants/theme';
import { initHealthKit, isHealthKitInitialized } from '../../src/services/health';
import { useWakeRecordStore } from '../../src/stores/wake-record-store';

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  // getDay() returns 0 for Sunday, so adjust to get Monday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function StatsScreen() {
  const { t } = useTranslation('stats');
  const records = useWakeRecordStore((s) => s.records);
  const getWeekStats = useWakeRecordStore((s) => s.getWeekStats);
  const getCurrentStreak = useWakeRecordStore((s) => s.getCurrentStreak);
  const getRecordsForPeriod = useWakeRecordStore((s) => s.getRecordsForPeriod);

  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [healthKitConnected, setHealthKitConnected] = useState(() => isHealthKitInitialized());
  const [healthKitConnecting, setHealthKitConnecting] = useState(false);

  const handleConnectHealthKit = useCallback(async () => {
    setHealthKitConnecting(true);
    const success = await initHealthKit();
    setHealthKitConnected(success);
    setHealthKitConnecting(false);
  }, []);

  const weekStats = useMemo(() => getWeekStats(weekStart), [getWeekStats, weekStart]);
  const currentStreak = useMemo(() => getCurrentStreak(), [getCurrentStreak]);

  const weekEnd = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    return end;
  }, [weekStart]);

  const weekRecords = useMemo(
    () => getRecordsForPeriod(weekStart, weekEnd),
    [getRecordsForPeriod, weekStart, weekEnd],
  );

  const handlePrevWeek = useCallback(() => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }, []);

  const handleNextWeek = useCallback(() => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }, []);

  if (records.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>{t('noData')}</Text>
        <Text style={styles.emptyHint}>{t('noDataHint')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>{t('thisWeek')}</Text>
      <SummaryCards stats={weekStats} />
      <WeeklyCalendar
        records={weekRecords}
        weekStart={weekStart}
        onPrevWeek={handlePrevWeek}
        onNextWeek={handleNextWeek}
      />
      <StreakDisplay currentStreak={currentStreak} longestStreak={weekStats.longestStreak} />

      {/* HealthKit connection banner */}
      {healthKitConnected ? (
        <View style={styles.healthKitBanner}>
          <Text style={styles.healthKitConnectedText}>{t('healthKit.connected')}</Text>
        </View>
      ) : (
        <View style={styles.healthKitBanner}>
          <Text style={styles.healthKitBannerText}>{t('healthKit.noData')}</Text>
          <Text style={styles.healthKitBannerHint}>{t('healthKit.noDataHint')}</Text>
          <Pressable
            style={[styles.healthKitButton, healthKitConnecting && styles.healthKitButtonDisabled]}
            onPress={handleConnectHealthKit}
            disabled={healthKitConnecting}
          >
            <Text style={styles.healthKitButtonText}>{t('healthKit.connect')}</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptyHint: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  healthKitBanner: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  healthKitBannerText: {
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  healthKitBannerHint: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  healthKitConnectedText: {
    fontSize: fontSize.sm,
    color: colors.success,
    fontWeight: '500',
  },
  healthKitButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  healthKitButtonDisabled: {
    opacity: 0.5,
  },
  healthKitButtonText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '600',
  },
});
