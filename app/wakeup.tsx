import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TodoListItem } from '../src/components/TodoListItem';
import { borderRadius, colors, fontSize, spacing } from '../src/constants/theme';
import { getSleepSummary, isHealthKitInitialized } from '../src/services/health';
import { playAlarmSound, stopAlarmSound } from '../src/services/sound';
import { useWakeRecordStore } from '../src/stores/wake-record-store';
import { useWakeTargetStore } from '../src/stores/wake-target-store';
import { formatTime } from '../src/types/alarm';
import type { WakeTodoRecord } from '../src/types/wake-record';
import {
  calculateDiffMinutes,
  calculateWakeResult,
  formatDateString,
} from '../src/types/wake-record';
import { resolveTimeForDate } from '../src/types/wake-target';

const VIBRATION_PATTERN = [500, 1000, 500, 1000];
const DEMO_SOUND_DURATION_MS = 3000;

export default function WakeUpScreen() {
  const { t } = useTranslation('wakeup');
  const { t: tCommon } = useTranslation('common');
  const { demo } = useLocalSearchParams<{ demo?: string }>();
  const isDemo = demo === 'true';
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const target = useWakeTargetStore((s) => s.target);
  const toggleTodoCompleted = useWakeTargetStore((s) => s.toggleTodoCompleted);
  const areAllTodosCompleted = useWakeTargetStore((s) => s.areAllTodosCompleted);
  const clearNextOverride = useWakeTargetStore((s) => s.clearNextOverride);

  const addRecord = useWakeRecordStore((s) => s.addRecord);
  const updateRecord = useWakeRecordStore((s) => s.updateRecord);

  const todos = target?.todos ?? [];
  const allCompleted = areAllTodosCompleted();
  const resolvedTime = target !== null ? resolveTimeForDate(target, new Date()) : null;

  const [currentTime, setCurrentTime] = useState(new Date());

  const mountedAt = useRef(new Date());
  const lastTodoCompletedAt = useRef<Date | null>(null);

  // Start alarm sound and vibration
  useEffect(() => {
    if (isDemo) {
      playAlarmSound();
      const timer = setTimeout(() => {
        stopAlarmSound();
      }, DEMO_SOUND_DURATION_MS);
      return () => {
        clearTimeout(timer);
        stopAlarmSound();
      };
    }

    playAlarmSound();
    Vibration.vibrate(VIBRATION_PATTERN, true);

    return () => {
      stopAlarmSound();
      Vibration.cancel();
    };
  }, [isDemo]);

  // Update current time display
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Stop sound when all todos completed (non-demo)
  useEffect(() => {
    if (allCompleted && !isDemo) {
      stopAlarmSound();
      Vibration.cancel();
    }
  }, [allCompleted, isDemo]);

  const handleToggleTodo = useCallback(
    (todoId: string) => {
      const todo = todos.find((t) => t.id === todoId);
      if (todo && !todo.completed) {
        lastTodoCompletedAt.current = new Date();
      }
      toggleTodoCompleted(todoId);
    },
    [todos, toggleTodoCompleted],
  );

  const handleDismiss = useCallback(() => {
    stopAlarmSound();
    Vibration.cancel();

    if (isDemo) {
      router.back();
      return;
    }

    // Record wake data
    if (target !== null && resolvedTime !== null) {
      const now = new Date();
      const diffMinutes = calculateDiffMinutes(resolvedTime, now);
      const result = calculateWakeResult(diffMinutes);

      const todoCompletionSeconds = lastTodoCompletedAt.current
        ? Math.round((lastTodoCompletedAt.current.getTime() - mountedAt.current.getTime()) / 1000)
        : 0;

      const todoRecords: readonly WakeTodoRecord[] = todos.map((todo, index) => ({
        id: todo.id,
        title: todo.title,
        completedAt: todo.completed ? now.toISOString() : null,
        orderCompleted: todo.completed ? index + 1 : null,
      }));

      const dateStr = formatDateString(now);

      addRecord({
        alarmId: 'wake-target',
        date: dateStr,
        targetTime: resolvedTime,
        alarmTriggeredAt: mountedAt.current.toISOString(),
        dismissedAt: now.toISOString(),
        healthKitWakeTime: null,
        result,
        diffMinutes,
        todos: todoRecords,
        todoCompletionSeconds,
        alarmLabel: '',
      })
        .then((record) => {
          if (!isHealthKitInitialized()) {
            return;
          }
          return getSleepSummary(now).then((summary) => {
            if (summary === null) {
              return;
            }
            const hkWakeTime = new Date(summary.wakeUpTime);
            const hkDiffMinutes = calculateDiffMinutes(resolvedTime, hkWakeTime);
            const hkResult = calculateWakeResult(hkDiffMinutes);
            return updateRecord(record.id, {
              healthKitWakeTime: summary.wakeUpTime,
              diffMinutes: hkDiffMinutes,
              result: hkResult,
            });
          });
        })
        .catch(() => {
          // Non-blocking: don't disrupt dismiss flow
        });
    }

    clearNextOverride();
    router.replace('/');
  }, [target, resolvedTime, todos, isDemo, addRecord, updateRecord, clearNextOverride, router]);

  if (target === null) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{t('alarmNotFound')}</Text>
        <Pressable style={styles.dismissButton} onPress={() => router.replace('/')}>
          <Text style={styles.dismissButtonText}>{tCommon('goBack')}</Text>
        </Pressable>
      </View>
    );
  }

  const completedCount = todos.filter((t) => t.completed).length;
  const totalCount = todos.length;
  const progress = totalCount > 0 ? completedCount / totalCount : 1;

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
      {/* Current time */}
      <Text style={styles.currentTime}>
        {currentTime.getHours().toString().padStart(2, '0')}
        {':'}
        {currentTime.getMinutes().toString().padStart(2, '0')}
      </Text>

      {/* Target time */}
      {resolvedTime !== null && (
        <Text style={styles.alarmTime}>{t('alarmPrefix', { time: formatTime(resolvedTime) })}</Text>
      )}

      {/* Progress */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {t('progress', { completed: completedCount, total: totalCount })}
        </Text>
      </View>

      {/* Status message */}
      <Text style={[styles.statusText, allCompleted && styles.statusTextSuccess]}>
        {allCompleted ? t('statusComplete') : t('statusIncomplete')}
      </Text>

      {/* Todo list */}
      <ScrollView style={styles.todoList} contentContainerStyle={styles.todoListContent}>
        {todos.map((todo) => (
          <TodoListItem key={todo.id} item={todo} onToggle={handleToggleTodo} />
        ))}
      </ScrollView>

      {/* Dismiss button */}
      <Pressable
        style={[styles.dismissButton, !allCompleted && styles.dismissButtonDisabled]}
        onPress={handleDismiss}
        disabled={!allCompleted}
        accessibilityRole="button"
        accessibilityLabel={isDemo ? t('statusComplete') : t('dismissAlarm')}
        accessibilityState={{ disabled: !allCompleted }}
      >
        <Text style={[styles.dismissButtonText, !allCompleted && styles.dismissButtonTextDisabled]}>
          {isDemo
            ? allCompleted
              ? t('statusComplete')
              : t('completeAllTasks')
            : allCompleted
              ? t('dismissAlarm')
              : t('completeAllTasks')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  currentTime: {
    fontSize: 72,
    fontWeight: '100',
    color: colors.text,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  alarmTime: {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  progressContainer: {
    marginVertical: spacing.xl,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.success,
    borderRadius: borderRadius.full,
  },
  progressText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  statusText: {
    fontSize: fontSize.md,
    color: colors.warning,
    textAlign: 'center',
    marginBottom: spacing.md,
    fontWeight: '600',
  },
  statusTextSuccess: {
    color: colors.success,
  },
  todoList: {
    flex: 1,
  },
  todoListContent: {
    paddingBottom: spacing.md,
  },
  dismissButton: {
    backgroundColor: colors.success,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  dismissButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  dismissButtonText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  dismissButtonTextDisabled: {
    color: colors.textMuted,
  },
  errorText: {
    color: colors.text,
    fontSize: fontSize.lg,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});
