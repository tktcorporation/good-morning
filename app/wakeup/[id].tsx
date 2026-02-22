import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TodoListItem } from '../../src/components/TodoListItem';
import { borderRadius, colors, fontSize, spacing } from '../../src/constants/theme';
import { getSleepSummary, isHealthKitInitialized } from '../../src/services/health';
import { playAlarmSound, stopAlarmSound } from '../../src/services/sound';
import { useAlarmStore } from '../../src/stores/alarm-store';
import { useWakeRecordStore } from '../../src/stores/wake-record-store';
import { formatTime } from '../../src/types/alarm';
import type { WakeTodoRecord } from '../../src/types/wake-record';
import {
  calculateDiffMinutes,
  calculateWakeResult,
  formatDateString,
} from '../../src/types/wake-record';

const VIBRATION_PATTERN = [500, 1000, 500, 1000];

export default function WakeUpScreen() {
  const { t } = useTranslation('wakeup');
  const { t: tCommon } = useTranslation('common');
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const alarms = useAlarmStore((s) => s.alarms);
  const toggleTodo = useAlarmStore((s) => s.toggleTodo);
  const areAllTodosCompleted = useAlarmStore((s) => s.areAllTodosCompleted);
  const setActiveAlarm = useAlarmStore((s) => s.setActiveAlarm);

  const addRecord = useWakeRecordStore((s) => s.addRecord);
  const updateRecord = useWakeRecordStore((s) => s.updateRecord);

  const alarm = alarms.find((a) => a.id === id);
  const allCompleted = id ? areAllTodosCompleted(id) : false;

  const [currentTime, setCurrentTime] = useState(new Date());

  // Track when the wakeup screen mounted (alarm triggered time)
  const mountedAt = useRef(new Date());
  // Track the last todo completion timestamp
  const lastTodoCompletedAt = useRef<Date | null>(null);

  // Start alarm sound and vibration
  useEffect(() => {
    playAlarmSound();
    Vibration.vibrate(VIBRATION_PATTERN, true);

    return () => {
      stopAlarmSound();
      Vibration.cancel();
    };
  }, []);

  // Update current time display
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Stop sound when all todos completed
  useEffect(() => {
    if (allCompleted) {
      stopAlarmSound();
      Vibration.cancel();
    }
  }, [allCompleted]);

  const handleToggleTodo = useCallback(
    (todoId: string) => {
      if (id) {
        // Track when a todo is completed (not unchecked)
        const todo = alarm?.todos.find((t) => t.id === todoId);
        if (todo && !todo.completed) {
          lastTodoCompletedAt.current = new Date();
        }
        toggleTodo(id, todoId);
      }
    },
    [id, toggleTodo, alarm?.todos],
  );

  const handleDismiss = useCallback(() => {
    stopAlarmSound();
    Vibration.cancel();

    // Record wake data
    if (alarm) {
      const now = new Date();
      const diffMinutes = calculateDiffMinutes(alarm.time, now);
      const result = calculateWakeResult(diffMinutes);

      const todoCompletionSeconds = lastTodoCompletedAt.current
        ? Math.round((lastTodoCompletedAt.current.getTime() - mountedAt.current.getTime()) / 1000)
        : 0;

      const todos: readonly WakeTodoRecord[] = alarm.todos.map((todo, index) => ({
        id: todo.id,
        title: todo.title,
        completedAt: todo.completed ? now.toISOString() : null,
        orderCompleted: todo.completed ? index + 1 : null,
      }));

      const dateStr = formatDateString(now);

      // Add record immediately (don't block on HealthKit)
      addRecord({
        alarmId: alarm.id,
        date: dateStr,
        targetTime: alarm.time,
        alarmTriggeredAt: mountedAt.current.toISOString(),
        dismissedAt: now.toISOString(),
        healthKitWakeTime: null,
        result,
        diffMinutes,
        todos,
        todoCompletionSeconds,
        alarmLabel: alarm.label,
      }).then((record) => {
        // Asynchronously fetch HealthKit data and update the record if available
        if (isHealthKitInitialized()) {
          getSleepSummary(now).then((summary) => {
            if (summary !== null) {
              updateRecord(record.id, { healthKitWakeTime: summary.wakeUpTime });
            }
          });
        }
      });
    }

    setActiveAlarm(null);
    router.replace('/');
  }, [alarm, addRecord, updateRecord, setActiveAlarm, router]);

  if (!alarm) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{t('alarmNotFound')}</Text>
        <Pressable style={styles.dismissButton} onPress={handleDismiss}>
          <Text style={styles.dismissButtonText}>{tCommon('goBack')}</Text>
        </Pressable>
      </View>
    );
  }

  const completedCount = alarm.todos.filter((t) => t.completed).length;
  const totalCount = alarm.todos.length;
  const progress = totalCount > 0 ? completedCount / totalCount : 1;

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
      {/* Current time */}
      <Text style={styles.currentTime}>
        {currentTime.getHours().toString().padStart(2, '0')}
        {':'}
        {currentTime.getMinutes().toString().padStart(2, '0')}
      </Text>

      {/* Alarm info */}
      <Text style={styles.alarmTime}>{t('alarmPrefix', { time: formatTime(alarm.time) })}</Text>
      {alarm.label !== '' && <Text style={styles.label}>{alarm.label}</Text>}

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
        {alarm.todos.map((todo) => (
          <TodoListItem key={todo.id} item={todo} onToggle={handleToggleTodo} />
        ))}
      </ScrollView>

      {/* Dismiss button */}
      <Pressable
        style={[styles.dismissButton, !allCompleted && styles.dismissButtonDisabled]}
        onPress={handleDismiss}
        disabled={!allCompleted}
        accessibilityRole="button"
        accessibilityLabel={t('dismissAlarm')}
        accessibilityState={{ disabled: !allCompleted }}
      >
        <Text style={[styles.dismissButtonText, !allCompleted && styles.dismissButtonTextDisabled]}>
          {allCompleted ? t('dismissAlarm') : t('completeAllTasks')}
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
  label: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
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
