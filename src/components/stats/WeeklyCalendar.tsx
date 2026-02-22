import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../../constants/theme';
import { formatTime } from '../../types/alarm';
import type { WakeRecord, WakeResult } from '../../types/wake-record';

interface WeeklyCalendarProps {
  readonly records: readonly WakeRecord[];
  readonly weekStart: Date;
  readonly onPrevWeek: () => void;
  readonly onNextWeek: () => void;
}

const RESULT_COLORS: Record<WakeResult, string> = {
  great: colors.success,
  ok: colors.warning,
  late: colors.primary,
  missed: colors.textMuted,
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const DAY_LABELS_JA = ['月', '火', '水', '木', '金', '土', '日'] as const;

function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatWeekLabel(weekStart: Date): string {
  return `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
}

export function WeeklyCalendar({
  records,
  weekStart,
  onPrevWeek,
  onNextWeek,
}: WeeklyCalendarProps) {
  const { t, i18n } = useTranslation('stats');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const isJa = i18n.language === 'ja';
  const dayLabels = isJa ? DAY_LABELS_JA : DAY_LABELS;

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
              <Text style={styles.dayLabel}>{dayLabels[index]}</Text>
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
