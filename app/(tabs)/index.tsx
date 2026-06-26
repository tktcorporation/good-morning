import { Effect } from 'effect';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GradeIcon } from '../../src/components/grade/GradeIcon';
import { StreakBadge } from '../../src/components/grade/StreakBadge';
import { ProgressBar } from '../../src/components/ProgressBar';
import { SleepDurationCard } from '../../src/components/SleepDurationCard';
import { SquatChallengeItem } from '../../src/components/SquatChallengeItem';
import { SleepCard } from '../../src/components/sleep/SleepCard';
import { TodoListItem } from '../../src/components/TodoListItem';
import { borderRadius, colors, commonStyles, fontSize, spacing } from '../../src/constants/theme';
import { useCountdown } from '../../src/hooks/useCountdown';
import { useDailySummary } from '../../src/hooks/useDailySummary';
import { useGradeFinalization } from '../../src/hooks/useGradeFinalization';
import {
  AlarmKit,
  isAlarmKitAvailable,
  onAllTodosCompletedEffect,
  runEffectFork,
} from '../../src/services';
import { useDailyGradeStore } from '../../src/stores/daily-grade-store';
import { useMorningSessionStore } from '../../src/stores/morning-session-store';
import { useSettingsStore } from '../../src/stores/settings-store';
import { useWakeRecordStore } from '../../src/stores/wake-record-store';
import { useWakeTargetStore } from '../../src/stores/wake-target-store';
import type { AlarmTime, DayOfWeek } from '../../src/types/alarm';
import { formatTime, getDayLabel } from '../../src/types/alarm';
import type { WakeTarget } from '../../src/types/wake-target';
import { resolveTimeForDate } from '../../src/types/wake-target';
import { getLogicalDateString, getRecentDates } from '../../src/utils/date';
import { getLocalizedTodoTitle } from '../../src/utils/todo-display';

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

/**
 * 週間カレンダー。各日のグレードアイコンを表示し、タップで日次レビューに遷移。
 * DashboardScreen の認知複雑度を下げるため分離。
 */
function WeeklyCalendar({
  recentDates,
  dayBoundaryHour,
  onDayPress,
}: {
  readonly recentDates: readonly Date[];
  readonly dayBoundaryHour: number;
  readonly onDayPress: (date: Date) => void;
}) {
  const { t } = useTranslation('dashboard');
  const { t: tCommon } = useTranslation('common');
  const getGradeForDate = useDailyGradeStore((s) => s.getGradeForDate);

  return (
    <View style={commonStyles.section}>
      <Text style={commonStyles.sectionTitle}>{t('week.title')}</Text>
      <View style={styles.weekRow}>
        {recentDates.map((date) => {
          const dateStr = getLogicalDateString(date, dayBoundaryHour);
          const gradeRecord = getGradeForDate(dateStr);
          const isToday = dateStr === getLogicalDateString(new Date(), dayBoundaryHour);
          // 表示用の日付番号・曜日は論理日付から取得する。
          // dayBoundaryHour 前にアプリを開いた場合、カレンダー日付と論理日付がずれるため、
          // date.getDate() / date.getDay() をそのまま使うと表示と実データが不一致になる。
          const logicalDate = new Date(`${dateStr}T12:00:00`);

          return (
            <Pressable key={dateStr} style={styles.dayColumn} onPress={() => onDayPress(date)}>
              <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>
                {getDayLabel(logicalDate.getDay() as DayOfWeek, tCommon as (key: string) => string)}
              </Text>
              <GradeIcon grade={gradeRecord?.grade ?? null} size={16} />
              <Text style={styles.dayNumber}>{`${logicalDate.getDate()}`}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * モーニングルーティンセクション（セッション中の進捗・カウントダウン・TODOチェックリスト）。
 * DashboardScreen の認知複雑度を下げるため分離。
 */
function MorningRoutineSection({
  session,
  progress,
  goalRemaining,
  goalExceeded,
  snoozeRemaining,
  onToggleTodo,
  onIncrementTodo,
  onCompleteTodo,
}: {
  readonly session: import('../../src/types/morning-session').MorningSession;
  readonly progress: { completed: number; total: number };
  readonly goalRemaining: string | null;
  readonly goalExceeded: boolean;
  readonly snoozeRemaining: string | null;
  readonly onToggleTodo: (id: string) => void;
  readonly onIncrementTodo: (id: string) => void;
  readonly onCompleteTodo: (id: string) => void;
}) {
  const { t } = useTranslation('dashboard');
  return (
    <View style={commonStyles.section}>
      <Text style={commonStyles.sectionTitle}>{t('morningRoutine.title')}</Text>
      <View style={styles.routineProgressContainer}>
        <ProgressBar
          ratio={progress.total > 0 ? progress.completed / progress.total : 0}
          height={8}
        />
        <Text style={styles.routineProgressText}>
          {t('morningRoutine.progress', {
            completed: progress.completed,
            total: progress.total,
          })}
        </Text>
      </View>
      {goalRemaining !== null &&
        (goalExceeded ? (
          <Text style={styles.goalExceededText}>
            {t('morningRoutine.goalExceeded', { time: goalRemaining })}
          </Text>
        ) : (
          <Text style={styles.goalCountdownText}>
            {t('morningRoutine.goalCountdown', { time: goalRemaining })}
          </Text>
        ))}
      {snoozeRemaining !== null && (
        <Text style={styles.snoozeCountdownText}>
          {t('morningRoutine.snoozeCountdown', { time: snoozeRemaining })}
        </Text>
      )}
      {session.todos.map((todo) =>
        (todo.type ?? 'checkbox') === 'squat' ? (
          <SquatChallengeItem
            key={todo.id}
            todo={todo}
            onIncrement={onIncrementTodo}
            onComplete={onCompleteTodo}
          />
        ) : (
          <TodoListItem
            key={todo.id}
            item={{ id: todo.id, title: todo.title, completed: todo.completed }}
            onToggle={onToggleTodo}
          />
        ),
      )}
    </View>
  );
}

/**
 * 明日のタスク表示セクション（セッション非アクティブ時）。
 *
 * 起床タスクは「スクワット 10 回」固定（FIXED_SQUAT_TODO_ID 参照）。
 * 編集・追加・削除 UI は意図的に持たない — ユーザーがタスクを自分で組み立てる
 * 認知負荷を下げるため、選択肢ゼロにしている。
 */
function TodoDisplaySection() {
  const { t } = useTranslation('dashboard');
  return (
    <View style={commonStyles.section}>
      <Text style={commonStyles.sectionTitle}>{t('todos.title')}</Text>
      <View style={styles.todoRow}>
        <View style={[styles.todoBullet, styles.todoBulletSquat]} />
        <Text style={styles.todoText}>{t('todos.fixedTaskLabel')}</Text>
      </View>
    </View>
  );
}

/**
 * 起床目標バッファ設定セクション。DashboardScreen の認知複雑度を下げるため分離。
 * アラーム時刻 + バッファ分のデッドライン時刻を計算して表示する。
 */
function GoalBufferSection({
  target,
  resolvedTime,
}: {
  readonly target: WakeTarget;
  readonly resolvedTime: AlarmTime | null;
}) {
  const { t } = useTranslation('dashboard');
  const setWakeUpGoalBufferMinutes = useWakeTargetStore((s) => s.setWakeUpGoalBufferMinutes);
  return (
    <View style={commonStyles.section}>
      <Text style={commonStyles.sectionTitle}>{t('goalBuffer.title')}</Text>
      <View style={styles.bufferRow}>
        <Pressable
          style={styles.bufferButton}
          onPress={() =>
            setWakeUpGoalBufferMinutes(Math.max(10, target.wakeUpGoalBufferMinutes - 5))
          }
        >
          <Text style={styles.bufferButtonText}>{'-'}</Text>
        </Pressable>
        <Text style={styles.bufferValue}>
          {t('goalBuffer.value', { minutes: target.wakeUpGoalBufferMinutes })}
        </Text>
        <Pressable
          style={styles.bufferButton}
          onPress={() =>
            setWakeUpGoalBufferMinutes(Math.min(120, target.wakeUpGoalBufferMinutes + 5))
          }
        >
          <Text style={styles.bufferButtonText}>{'+'}</Text>
        </Pressable>
      </View>
      {resolvedTime !== null && (
        <Text style={styles.bufferDescription}>
          {t('goalBuffer.description', {
            goalTime: formatTime({
              hour:
                Math.floor(
                  (resolvedTime.hour * 60 + resolvedTime.minute + target.wakeUpGoalBufferMinutes) /
                    60,
                ) % 24,
              minute: (resolvedTime.minute + target.wakeUpGoalBufferMinutes) % 60,
            }),
          })}
        </Text>
      )}
    </View>
  );
}

export default function DashboardScreen() {
  useGradeFinalization();

  const { t } = useTranslation('dashboard');
  const { t: tCommon } = useTranslation('common');
  const router = useRouter();

  const gradeStreak = useDailyGradeStore((s) => s.streak);

  const target = useWakeTargetStore((s) => s.target);
  const loaded = useWakeTargetStore((s) => s.loaded);

  const getWeekStats = useWakeRecordStore((s) => s.getWeekStats);
  const setTargetSleepMinutes = useWakeTargetStore((s) => s.setTargetSleepMinutes);
  const dayBoundaryHour = useSettingsStore((s) => s.dayBoundaryHour);

  const session = useMorningSessionStore((s) => s.session);
  const toggleTodo = useMorningSessionStore((s) => s.toggleTodo);
  const incrementTodoCount = useMorningSessionStore((s) => s.incrementTodoCount);
  const areAllCompleted = useMorningSessionStore((s) => s.areAllCompleted);
  const getProgress = useMorningSessionStore((s) => s.getProgress);
  const snoozeFiresAt = useMorningSessionStore((s) => s.session?.snoozeFiresAt ?? null);

  const alarmKitAvailable = useMemo(() => isAlarmKitAvailable(), []);

  // カウントダウンタイマー: スヌーズ（超過後は非表示）と目標（超過後も経過時間を警告表示）
  const { remaining: snoozeRemaining } = useCountdown(snoozeFiresAt);
  const { remaining: goalRemaining, exceeded: goalExceeded } = useCountdown(
    session?.goalDeadline ?? null,
    true,
  );

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
  // TODO 全完了時にスヌーズ・LA を停止し WakeRecord を更新する。
  // セッション自体はクリアしない（ウィンドウ終了まで維持される）。
  useEffect(() => {
    if (session === null || !areAllCompleted()) return;
    runEffectFork(onAllTodosCompletedEffect(session));
  }, [session, areAllCompleted]);

  const handleToggleTodo = useCallback(
    async (todoId: string) => {
      // await で persistSession 完了を保証する。set() 自体は同期なので
      // UI は即座に更新されるが、await 後に getState() すれば
      // AsyncStorage 永続化も完了した確定状態を読める。
      await toggleTodo(todoId);

      const state = useMorningSessionStore.getState();
      const activityId = state.session?.liveActivityId ?? null;
      const currentSession = state.session;
      if (activityId !== null && currentSession !== null) {
        const snoozeEpoch = currentSession.snoozeFiresAt
          ? Math.floor(new Date(currentSession.snoozeFiresAt).getTime() / 1000)
          : null;
        runEffectFork(
          Effect.gen(function* () {
            const kit = yield* AlarmKit;
            yield* kit.updateLiveActivity(
              activityId,
              currentSession.todos.map((t) => ({
                id: t.id,
                title: getLocalizedTodoTitle(t),
                completed: t.completed,
              })),
              snoozeEpoch,
            );
          }),
        );
      }
    },
    [toggleTodo],
  );

  const handleIncrementTodo = useCallback(
    async (todoId: string) => {
      await incrementTodoCount(todoId);
    },
    [incrementTodoCount],
  );

  // スクワットタスク完了時も handleToggleTodo と同じ Live Activity 更新が走る。
  // incrementTodoCount が completed を true にした後に呼ばれるため、
  // ここでは追加のストア操作は不要（onAllTodosCompletedEffect が useEffect で発火する）。
  const handleCompleteTodo = useCallback((_todoId: string) => {
    // 完了エフェクトは useEffect 側で areAllCompleted() を監視して発火するため、ここでは何もしない。
  }, []);

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

      {/* Sleep Duration Card -- 目標睡眠時間と就寝目標時刻を表示 */}
      <SleepDurationCard
        alarmTime={resolvedTime}
        targetSleepMinutes={target?.targetSleepMinutes ?? null}
        onSleepMinutesChange={setTargetSleepMinutes}
      />

      {/* Wake-up Goal Buffer -- 起床目標バッファ設定 */}
      {target !== null && !sessionActive && (
        <GoalBufferSection target={target} resolvedTime={resolvedTime} />
      )}

      {/* Morning Routine Session (active) OR Todo List (inactive) */}
      {sessionActive && progress !== null ? (
        <MorningRoutineSection
          session={session}
          progress={progress}
          goalRemaining={goalRemaining}
          goalExceeded={goalExceeded}
          snoozeRemaining={snoozeRemaining}
          onToggleTodo={handleToggleTodo}
          onIncrementTodo={handleIncrementTodo}
          onCompleteTodo={handleCompleteTodo}
        />
      ) : (
        <TodoDisplaySection />
      )}

      {/* Streak Badge — グレードストアから取得したストリーク情報を表示 */}
      <View style={commonStyles.section}>
        <StreakBadge
          currentStreak={gradeStreak.currentStreak}
          freezesAvailable={gradeStreak.freezesAvailable}
        />
      </View>

      {/* Weekly Calendar — 各日のグレードを GradeIcon で表示 */}
      <WeeklyCalendar
        recentDates={recentDates}
        dayBoundaryHour={dayBoundaryHour}
        onDayPress={handleDayPress}
      />

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
  routineProgressText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  goalCountdownText: {
    fontSize: fontSize.md,
    color: colors.primaryLight,
    textAlign: 'center',
    marginTop: spacing.xs,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  /** 目標超過時の警告テキスト。赤系の目立つ色でユーザーに超過を伝える。 */
  goalExceededText: {
    fontSize: fontSize.md,
    color: colors.primary,
    textAlign: 'center',
    marginTop: spacing.xs,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  snoozeCountdownText: {
    fontSize: fontSize.sm,
    color: colors.warning,
    textAlign: 'center',
    marginTop: spacing.xs,
  },

  // Goal Buffer
  bufferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
  bufferButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bufferButtonText: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '300',
  },
  bufferValue: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    minWidth: 80,
    textAlign: 'center',
  },
  bufferDescription: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },

  // Todos (display-only — 起床タスクは固定スクワットのみ)
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
  todoBulletSquat: {
    backgroundColor: colors.warning,
  },
  todoText: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
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
