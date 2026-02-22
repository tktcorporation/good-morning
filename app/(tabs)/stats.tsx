import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { StreakDisplay } from '../../src/components/stats/StreakDisplay';
import { SummaryCards } from '../../src/components/stats/SummaryCards';
import { WeeklyCalendar } from '../../src/components/stats/WeeklyCalendar';
import { colors, fontSize, spacing } from '../../src/constants/theme';
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
});
