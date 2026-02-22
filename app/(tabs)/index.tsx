import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../../src/constants/theme';
import { useWakeRecordStore } from '../../src/stores/wake-record-store';
import { useWakeTargetStore } from '../../src/stores/wake-target-store';
import { formatTime } from '../../src/types/alarm';
import type { WakeRecord, WakeResult } from '../../src/types/wake-record';
import { formatDateString } from '../../src/types/wake-record';
import { resolveTimeForDate } from '../../src/types/wake-target';

const RESULT_COLORS: Readonly<Record<WakeResult, string>> = {
  great: colors.success,
  ok: colors.success,
  late: colors.warning,
  missed: colors.primary,
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function getTomorrowDate(): Date {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

function getDayLabel(date: Date): string {
  const dayName = DAY_NAMES[date.getDay()];
  return dayName ?? '';
}

function getWeekDates(): readonly Date[] {
  const today = new Date();
  const dayOfWeek = today.getDay();
  // Week starts on Monday
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);

  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function getRecordForDate(records: readonly WakeRecord[], date: Date): WakeRecord | undefined {
  const dateStr = formatDateString(date);
  return records.find((r) => r.date === dateStr);
}

export default function DashboardScreen() {
  const { t } = useTranslation('dashboard');
  const { t: tCommon } = useTranslation('common');
  const router = useRouter();

  const target = useWakeTargetStore((s) => s.target);
  const loaded = useWakeTargetStore((s) => s.loaded);
  const addTodo = useWakeTargetStore((s) => s.addTodo);
  const removeTodo = useWakeTargetStore((s) => s.removeTodo);

  const records = useWakeRecordStore((s) => s.records);
  const getCurrentStreak = useWakeRecordStore((s) => s.getCurrentStreak);
  const getWeekStats = useWakeRecordStore((s) => s.getWeekStats);

  const [newTodoText, setNewTodoText] = useState('');

  const tomorrow = useMemo(() => getTomorrowDate(), []);
  const resolvedTime = useMemo(
    () => (target !== null ? resolveTimeForDate(target, tomorrow) : null),
    [target, tomorrow],
  );
  const tomorrowLabel = useMemo(() => `Tomorrow, ${getDayLabel(tomorrow)}`, [tomorrow]);

  const weekDates = useMemo(() => getWeekDates(), []);
  const weekStart = weekDates[0];
  const weekStats = useMemo(
    () => (weekStart !== undefined ? getWeekStats(weekStart) : null),
    [getWeekStats, weekStart],
  );
  const currentStreak = useMemo(() => getCurrentStreak(), [getCurrentStreak]);

  const weekRecords = useMemo(() => {
    if (weekStart === undefined) return [];
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const startStr = formatDateString(weekStart);
    const endStr = formatDateString(weekEnd);
    return records.filter((r) => r.date >= startStr && r.date <= endStr);
  }, [records, weekStart]);

  const handleAddTodo = useCallback(async () => {
    const trimmed = newTodoText.trim();
    if (trimmed.length === 0) return;
    await addTodo(trimmed);
    setNewTodoText('');
  }, [newTodoText, addTodo]);

  const handleRemoveTodo = useCallback(
    async (id: string) => {
      await removeTodo(id);
    },
    [removeTodo],
  );

  const handleTargetPress = useCallback(() => {
    router.push('/target-edit');
  }, [router]);

  const handleDayPress = useCallback(
    (date: Date) => {
      const dateStr = formatDateString(date);
      router.push(`/day-review?date=${dateStr}`);
    },
    [router],
  );

  if (!loaded) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>{tCommon('loading')}</Text>
      </View>
    );
  }

  const successCount =
    weekStats !== null ? weekStats.resultCounts.great + weekStats.resultCounts.ok : 0;
  const totalCount = weekStats?.totalRecords ?? 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Target Time Display */}
      <Pressable style={styles.targetSection} onPress={handleTargetPress}>
        <Text style={styles.targetLabel}>{tomorrowLabel}</Text>
        <Text style={styles.targetTime}>
          {resolvedTime !== null ? formatTime(resolvedTime) : t('targetOff')}
        </Text>
        {target?.nextOverride !== null && target?.nextOverride !== undefined && (
          <View style={styles.overrideBadge}>
            <Text style={styles.overrideBadgeText}>{t('override')}</Text>
          </View>
        )}
      </Pressable>

      {/* Todo List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('todos.title')}</Text>
        {target !== null && target.todos.length > 0 ? (
          target.todos.map((todo) => (
            <View key={todo.id} style={styles.todoRow}>
              <View style={styles.todoBullet} />
              <Text style={styles.todoText}>{todo.title}</Text>
              <Pressable style={styles.todoDeleteButton} onPress={() => handleRemoveTodo(todo.id)}>
                <Text style={styles.todoDeleteText}>{'x'}</Text>
              </Pressable>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>{t('todos.empty')}</Text>
        )}
        <View style={styles.addTodoRow}>
          <TextInput
            style={styles.addTodoInput}
            value={newTodoText}
            onChangeText={setNewTodoText}
            placeholder={t('todos.placeholder')}
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={handleAddTodo}
            returnKeyType="done"
          />
          <Pressable style={styles.addTodoButton} onPress={handleAddTodo}>
            <Text style={styles.addTodoButtonText}>{'+'}</Text>
          </Pressable>
        </View>
      </View>

      {/* Weekly Calendar */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('week.title')}</Text>
        <View style={styles.weekRow}>
          {weekDates.map((date) => {
            const record = getRecordForDate(weekRecords, date);
            const today = new Date();
            const isToday = formatDateString(date) === formatDateString(today);
            const dotColor = record !== undefined ? RESULT_COLORS[record.result] : colors.disabled;

            return (
              <Pressable
                key={formatDateString(date)}
                style={styles.dayColumn}
                onPress={() => handleDayPress(date)}
              >
                <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>
                  {DAY_NAMES[date.getDay()]}
                </Text>
                <View style={[styles.dayDot, { backgroundColor: dotColor }]} />
                <Text style={styles.dayNumber}>{`${date.getDate()}`}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Streak + Stats */}
      <View style={styles.section}>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statEmoji}>{'🔥'}</Text>
            <Text style={styles.statValue}>{`${currentStreak}`}</Text>
            <Text style={styles.statLabel}>{t('streak.current', { count: currentStreak })}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {t('week.success', {
                count: successCount,
                total: totalCount,
              })}
            </Text>
          </View>
        </View>
      </View>
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
    paddingBottom: spacing.xxl,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },

  // Target Time
  targetSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.lg,
  },
  targetLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    marginBottom: spacing.sm,
  },
  targetTime: {
    color: colors.text,
    fontSize: fontSize.time,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  overrideBadge: {
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  overrideBadgeText: {
    color: colors.warning,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },

  // Sections
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginBottom: spacing.md,
  },

  // Todos
  todoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  todoBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginRight: spacing.md,
  },
  todoText: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
  },
  todoDeleteButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  todoDeleteText: {
    color: colors.textMuted,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  addTodoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  addTodoInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    color: colors.text,
    fontSize: fontSize.md,
  },
  addTodoButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTodoButtonText: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '300',
  },

  // Weekly Calendar
  weekRow: {
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
  },
  dayLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  dayLabelToday: {
    color: colors.primary,
    fontWeight: '700',
  },
  dayDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: spacing.xs,
  },
  dayNumber: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  statEmoji: {
    fontSize: fontSize.xxl,
    marginBottom: spacing.xs,
  },
  statValue: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
});
