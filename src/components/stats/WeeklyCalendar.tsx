import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RESULT_COLORS, borderRadius, colors, fontSize, spacing } from '../../constants/theme';
import { formatTime } from '../../types/alarm';
import type { WakeRecord } from '../../types/wake-record';
import { formatDateString } from '../../types/wake-record';

interface WeeklyCalendarProps {
  readonly records: readonly WakeRecord[];
  readonly weekStart: Date;
  readonly onPrevWeek: () => void;
  readonly onNextWeek: () => void;
}

// Mon-Sun order using i18n keys: 1=Mon, 2=Tue, ..., 6=Sat, 0=Sun
const DAY_LABEL_KEYS = [
  'dayLabelsShort.1',
  'dayLabelsShort.2',
  'dayLabelsShort.3',
  'dayLabelsShort.4',
  'dayLabelsShort.5',
  'dayLabelsShort.6',
  'dayLabelsShort.0',
] as const;

function formatWeekLabel(weekStart: Date): string {
  return `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
}

function formatIsoTime(isoString: string): string {
  const date = new Date(isoString);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function WeeklyCalendar({
  records,
  weekStart,
  onPrevWeek,
  onNextWeek,
}: WeeklyCalendarProps) {
  const { t } = useTranslation('stats');
  const { t: tCommon } = useTranslation('common');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // Reset selection when navigating to a different week
  const prevWeekStartRef = useRef(weekStart);
  if (prevWeekStartRef.current !== weekStart) {
    prevWeekStartRef.current = weekStart;
    setSelectedDay(null);
  }

  // Build a map of date -> record for the week
  const weekDays = useMemo(() => {
    const days: Array<{ date: Date; dateStr: string; record: WakeRecord | undefined }> = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      const dateStr = formatDateString(date);
      const record = records.find((r) => r.date === dateStr);
      days.push({ date, dateStr, record });
    }
    return days;
  }, [records, weekStart]);

  const selectedRecord = selectedDay !== null ? weekDays[selectedDay]?.record : undefined;

  const handleDayPress = useCallback((index: number) => {
    setSelectedDay((prev) => (prev === index ? null : index));
  }, []);

  const formatDiff = useCallback(
    (diff: number): string => {
      const rounded = Math.round(Math.abs(diff));
      if (rounded === 0) return t('onTime');
      if (diff > 0) return t('minutesLate', { count: rounded });
      return t('minutesEarly', { count: rounded });
    },
    [t],
  );

  return (
    <View style={styles.container}>
      {/* Week navigation */}
      <View style={styles.weekNav}>
        <Pressable onPress={onPrevWeek} style={styles.navButton}>
          <Text style={styles.navButtonText}>{'<'}</Text>
        </Pressable>
        <Text style={styles.weekLabel}>{t('weekOf', { date: formatWeekLabel(weekStart) })}</Text>
        <Pressable onPress={onNextWeek} style={styles.navButton}>
          <Text style={styles.navButtonText}>{'>'}</Text>
        </Pressable>
      </View>

      {/* Day dots row */}
      <View style={styles.daysRow}>
        {weekDays.map((day, index) => {
          const dotColor = day.record ? RESULT_COLORS[day.record.result] : colors.textMuted;
          const isSelected = selectedDay === index;

          return (
            <Pressable
              key={day.dateStr}
              style={[styles.dayColumn, isSelected && styles.dayColumnSelected]}
              onPress={() => handleDayPress(index)}
            >
              <Text style={styles.dayLabel}>
                {tCommon(DAY_LABEL_KEYS[index] ?? 'dayLabelsShort.0')}
              </Text>
              <View style={[styles.dot, { backgroundColor: dotColor }]} />
              <Text style={styles.dayNumber}>{`${day.date.getDate()}`}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Selected day detail */}
      {selectedRecord != null && (
        <View style={styles.detail}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('avgWakeTime')}</Text>
            <Text style={styles.detailValue}>{formatTime(selectedRecord.targetTime)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('avgDiff')}</Text>
            <Text style={styles.detailValue}>{formatDiff(selectedRecord.diffMinutes)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t(selectedRecord.result)}</Text>
            <View
              style={[
                styles.resultBadge,
                { backgroundColor: RESULT_COLORS[selectedRecord.result] },
              ]}
            />
          </View>
          {selectedRecord.healthKitWakeTime != null && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('healthKit.wakeTime')}</Text>
              <Text style={styles.detailValue}>
                {formatIsoTime(selectedRecord.healthKitWakeTime)}
              </Text>
            </View>
          )}
          {selectedRecord.todos.length > 0 && (
            <View style={styles.todosSection}>
              {selectedRecord.todos.map((todo) => (
                <Text key={todo.id} style={styles.todoText}>
                  {todo.completedAt != null ? '✓ ' : '○ '}
                  {todo.title}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  weekNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  navButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonText: {
    fontSize: fontSize.xl,
    color: colors.text,
    fontWeight: '600',
  },
  weekLabel: {
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: '500',
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  dayColumn: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  dayColumnSelected: {
    backgroundColor: colors.surfaceLight,
  },
  dayLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: spacing.xs,
  },
  dayNumber: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  detail: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  detailLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  detailValue: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '500',
  },
  resultBadge: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  todosSection: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  todoText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
});
