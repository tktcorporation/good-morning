import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { GradeIcon } from '../../src/components/grade/GradeIcon';
import { StreakBadge } from '../../src/components/grade/StreakBadge';
import { SleepCard } from '../../src/components/sleep/SleepCard';
import { TodoListItem } from '../../src/components/TodoListItem';
import { borderRadius, colors, commonStyles, fontSize, spacing } from '../../src/constants/theme';
import { useDailySummary } from '../../src/hooks/useDailySummary';
import { useGradeFinalization } from '../../src/hooks/useGradeFinalization';
import {
  cancelSnooze,
  endLiveActivity,
  isAlarmKitAvailable,
  updateLiveActivity,
} from '../../src/services/alarm-kit';
import { useDailyGradeStore } from '../../src/stores/daily-grade-store';
import { useMorningSessionStore } from '../../src/stores/morning-session-store';
import { useSettingsStore } from '../../src/stores/settings-store';
import { useWakeRecordStore } from '../../src/stores/wake-record-store';
import { useWakeTargetStore } from '../../src/stores/wake-target-store';
import type { DayOfWeek } from '../../src/types/alarm';
import { formatTime, getDayLabel } from '../../src/types/alarm';
import type { WakeTodoRecord } from '../../src/types/wake-record';
import { resolveTimeForDate } from '../../src/types/wake-target';
import { getLogicalDateString, getRecentDates } from '../../src/utils/date';

function getTomorrowDate(): Date {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

/** 週間スタッツカード。レコードが0件の時は何も表示しない（"0/0 成功" は意味不明なため） */
function WeeklyStatsCard({
  weekStats,
}: {
  readonly weekStats: import('../../src/types/wake-record').WakeStats | null;
}) {
  const { t } = useTranslation('dashboard');
  const totalCount = weekStats?.totalRecords ?? 0;
  if (totalCount === 0) return null;
  const successCount =
    weekStats !== null ? weekStats.resultCounts.great + weekStats.resultCounts.ok : 0;
  return (
    <View style={commonStyles.section}>
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {t('week.success', { count: successCount, total: totalCount })}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  useGradeFinalization();

  const { t } = useTranslation('dashboard');
  const { t: tCommon } = useTranslation('common');
  const router = useRouter();

  const loadGrades = useDailyGradeStore((s) => s.loadGrades);
  const gradesLoaded = useDailyGradeStore((s) => s.loaded);
  const gradeStreak = useDailyGradeStore((s) => s.streak);
  const getGradeForDate = useDailyGradeStore((s) => s.getGradeForDate);

  const target = useWakeTargetStore((s) => s.target);
  const loaded = useWakeTargetStore((s) => s.loaded);
  const addTodo = useWakeTargetStore((s) => s.addTodo);
  const removeTodo = useWakeTargetStore((s) => s.removeTodo);

  const getWeekStats = useWakeRecordStore((s) => s.getWeekStats);
  const updateRecord = useWakeRecordStore((s) => s.updateRecord);

  const dayBoundaryHour = useSettingsStore((s) => s.dayBoundaryHour);

  const session = useMorningSessionStore((s) => s.session);
  const toggleTodo = useMorningSessionStore((s) => s.toggleTodo);
  const clearSession = useMorningSessionStore((s) => s.clearSession);
  const areAllCompleted = useMorningSessionStore((s) => s.areAllCompleted);
  const getProgress = useMorningSessionStore((s) => s.getProgress);
  const snoozeFiresAt = useMorningSessionStore((s) => s.snoozeFiresAt);

  const [newTodoText, setNewTodoText] = useState('');
  const [snoozeRemaining, setSnoozeRemaining] = useState<string | null>(null);
  const alarmKitAvailable = useMemo(() => isAlarmKitAvailable(), []);

  const today = useMemo(() => new Date(), []);
  const todaySummary = useDailySummary(today);

  const tomorrow = useMemo(() => getTomorrowDate(), []);
  const resolvedTime = useMemo(
    () => (target !== null ? resolveTimeForDate(target, tomorrow) : null),
    [target, tomorrow],
  );
  const tomorrowLabel = useMemo(() => {
    const dayLabel = getDayLabel(
      tomorrow.getDay() as DayOfWeek,
      tCommon as (key: string) => string,
    );
    return `${tCommon('tomorrow')}, ${dayLabel}`;
  }, [tomorrow, tCommon]);

  const recentDates = useMemo(() => getRecentDates(), []);
  // getWeekStats に渡す日付文字列は dayBoundaryHour を考慮する必要がある。
  // WakeRecord.date は getLogicalDateString で保存されるため、
  // 同じ関数で変換しないとレコードが見つからない。
  const weekStartStr = useMemo(
    () =>
      recentDates[0] !== undefined
        ? getLogicalDateString(recentDates[0], dayBoundaryHour)
        : undefined,
    [recentDates, dayBoundaryHour],
  );
  const weekStats = useMemo(
    () => (weekStartStr !== undefined ? getWeekStats(weekStartStr) : null),
    [getWeekStats, weekStartStr],
  );
  // グレード履歴とストリーク状態を AsyncStorage からロードする。
  // useGradeFinalization が gradeLoaded を参照するため、ダッシュボード表示時に
  // 確実にロード済みにしておく必要がある。
  useEffect(() => {
    if (!gradesLoaded) loadGrades();
  }, [gradesLoaded, loadGrades]);

  // Complete session when all todos are done
  useEffect(() => {
    if (session === null || !areAllCompleted()) return;

    // レコード更新前にスヌーズをキャンセルする。
    // updateRecord → clearSession の順で処理するため、先にキャンセルしないと
    // clearSession でストアの snoozeAlarmId が消えて参照できなくなる。
    const snoozeId = useMorningSessionStore.getState().snoozeAlarmId;
    if (snoozeId !== null) {
      cancelSnooze(snoozeId);
    }

    const now = new Date();
    const todosCompletedAt = now.toISOString();
    const todoCompletionSeconds = Math.round(
      (now.getTime() - new Date(session.startedAt).getTime()) / 1000,
    );

    const todoRecords: readonly WakeTodoRecord[] = session.todos.map((todo, index) => ({
      id: todo.id,
      title: todo.title,
      completedAt: todo.completedAt,
      orderCompleted: todo.completed ? index + 1 : null,
    }));

    // clearSession でストアの liveActivityId が消える前に Live Activity を終了する
    const activityId = useMorningSessionStore.getState().liveActivityId;
    if (activityId !== null) {
      endLiveActivity(activityId);
    }

    updateRecord(session.recordId, {
      todosCompleted: true,
      todosCompletedAt,
      todoCompletionSeconds,
      todos: todoRecords,
    }).then(() => clearSession());
  }, [session, areAllCompleted, updateRecord, clearSession]);

  // スヌーズ発火までのカウントダウンタイマー。M:SS 形式（例: "8:45"）で表示する。
  // snoozeFiresAt が null になった時点（TODO全完了 or セッションクリア）でタイマーを停止。
  useEffect(() => {
    if (snoozeFiresAt === null) {
      setSnoozeRemaining(null);
      return;
    }
    const updateCountdown = () => {
      const diff = new Date(snoozeFiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setSnoozeRemaining(null);
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setSnoozeRemaining(`${mins}:${secs.toString().padStart(2, '0')}`);
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [snoozeFiresAt]);

  const handleToggleTodo = useCallback(
    (todoId: string) => {
      toggleTodo(todoId);

      // setTimeout(0) で Zustand の state 更新を待つ。
      // toggleTodo() は同期的に set() するが、直後に getState() すると
      // 更新前の値が返る場合があるため、マイクロタスク境界を挟む。
      setTimeout(() => {
        const state = useMorningSessionStore.getState();
        const activityId = state.liveActivityId;
        if (activityId !== null && state.session !== null) {
          updateLiveActivity(
            activityId,
            state.session.todos.map((t) => ({ id: t.id, title: t.title, completed: t.completed })),
            state.snoozeFiresAt,
          );
        }
      }, 0);
    },
    [toggleTodo],
  );

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
      const dateStr = getLogicalDateString(date, dayBoundaryHour);
      router.push(`/day-review?date=${dateStr}`);
    },
    [router, dayBoundaryHour],
  );

  if (!loaded) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>{tCommon('loading')}</Text>
      </View>
    );
  }

  const sessionActive = session !== null;
  const progress = sessionActive ? getProgress() : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* AlarmKit Unavailable Error */}
      {!alarmKitAvailable && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{t('alarmKitUnavailable')}</Text>
        </View>
      )}

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

      {/* Morning Routine Session (active) OR Todo List (inactive) */}
      {sessionActive && progress !== null ? (
        <View style={commonStyles.section}>
          <Text style={commonStyles.sectionTitle}>{t('morningRoutine.title')}</Text>
          <View style={styles.routineProgressContainer}>
            <View style={styles.routineProgressBar}>
              <View
                style={[
                  styles.routineProgressFill,
                  {
                    width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.routineProgressText}>
              {t('morningRoutine.progress', {
                completed: progress.completed,
                total: progress.total,
              })}
            </Text>
          </View>
          {snoozeRemaining !== null && (
            <Text style={styles.snoozeCountdownText}>
              {t('morningRoutine.snoozeCountdown', { time: snoozeRemaining })}
            </Text>
          )}
          {session.todos.map((todo) => (
            <TodoListItem
              key={todo.id}
              item={{ id: todo.id, title: todo.title, completed: todo.completed }}
              onToggle={handleToggleTodo}
            />
          ))}
        </View>
      ) : (
        <View style={commonStyles.section}>
          <Text style={commonStyles.sectionTitle}>{t('todos.title')}</Text>
          {target !== null && target.todos.length > 0 ? (
            <>
              <Text style={styles.todoDescription}>{t('todos.description')}</Text>
              {target.todos.map((todo) => (
                <View key={todo.id} style={styles.todoRow}>
                  <View style={styles.todoBullet} />
                  <Text style={styles.todoText}>{todo.title}</Text>
                  <Pressable
                    style={styles.todoDeleteButton}
                    onPress={() => handleRemoveTodo(todo.id)}
                  >
                    <Text style={styles.todoDeleteText}>{'x'}</Text>
                  </Pressable>
                </View>
              ))}
            </>
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
      )}

      {/* Streak Badge — グレードストアから取得したストリーク情報を表示 */}
      <View style={commonStyles.section}>
        <StreakBadge
          currentStreak={gradeStreak.currentStreak}
          freezesAvailable={gradeStreak.freezesAvailable}
        />
      </View>

      {/* Weekly Calendar — 各日のグレードを GradeIcon で表示 */}
      <View style={commonStyles.section}>
        <Text style={commonStyles.sectionTitle}>{t('week.title')}</Text>
        <View style={styles.weekRow}>
          {recentDates.map((date) => {
            const dateStr = getLogicalDateString(date, dayBoundaryHour);
            const gradeRecord = getGradeForDate(dateStr);
            const isToday = dateStr === getLogicalDateString(new Date(), dayBoundaryHour);

            return (
              <Pressable
                key={dateStr}
                style={styles.dayColumn}
                onPress={() => handleDayPress(date)}
              >
                <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>
                  {getDayLabel(date.getDay() as DayOfWeek, tCommon as (key: string) => string)}
                </Text>
                <GradeIcon grade={gradeRecord?.grade ?? null} size={16} />
                <Text style={styles.dayNumber}>{`${date.getDate()}`}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Sleep Summary */}
      <View style={commonStyles.section}>
        <SleepCard summary={todaySummary} />
      </View>

      {/* Weekly Stats */}
      <WeeklyStatsCard weekStats={weekStats} />
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
  errorBanner: {
    backgroundColor: 'rgba(233, 69, 96, 0.15)',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorBannerText: {
    color: colors.primaryLight,
    fontSize: fontSize.sm,
    textAlign: 'center',
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

  // Morning Routine
  routineProgressContainer: {
    marginBottom: spacing.md,
  },
  routineProgressBar: {
    height: 8,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  routineProgressFill: {
    height: '100%',
    backgroundColor: colors.success,
    borderRadius: borderRadius.full,
  },
  routineProgressText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  snoozeCountdownText: {
    fontSize: fontSize.sm,
    color: colors.warning,
    textAlign: 'center',
    marginTop: spacing.xs,
  },

  // Todos
  todoDescription: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
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
  statValue: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
});
