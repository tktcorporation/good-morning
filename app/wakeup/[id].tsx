import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TodoListItem } from '../../src/components/TodoListItem';
import { borderRadius, colors, fontSize, spacing } from '../../src/constants/theme';
import { playAlarmSound, stopAlarmSound } from '../../src/services/sound';
import { useAlarmStore } from '../../src/stores/alarm-store';
import { formatTime } from '../../src/types/alarm';

const VIBRATION_PATTERN = [500, 1000, 500, 1000];

export default function WakeUpScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const alarms = useAlarmStore((s) => s.alarms);
  const toggleTodo = useAlarmStore((s) => s.toggleTodo);
  const areAllTodosCompleted = useAlarmStore((s) => s.areAllTodosCompleted);
  const setActiveAlarm = useAlarmStore((s) => s.setActiveAlarm);

  const alarm = alarms.find((a) => a.id === id);
  const allCompleted = id ? areAllTodosCompleted(id) : false;

  const [currentTime, setCurrentTime] = useState(new Date());

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
        toggleTodo(id, todoId);
      }
    },
    [id, toggleTodo],
  );

  const handleDismiss = useCallback(() => {
    stopAlarmSound();
    Vibration.cancel();
    setActiveAlarm(null);
    router.replace('/');
  }, [setActiveAlarm, router]);

  if (!alarm) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Alarm not found</Text>
        <Pressable style={styles.dismissButton} onPress={handleDismiss}>
          <Text style={styles.dismissButtonText}>Go Back</Text>
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
        {currentTime.getHours().toString().padStart(2, '0')}:
        {currentTime.getMinutes().toString().padStart(2, '0')}
      </Text>

      {/* Alarm info */}
      <Text style={styles.alarmTime}>Alarm: {formatTime(alarm.time)}</Text>
      {alarm.label !== '' && <Text style={styles.label}>{alarm.label}</Text>}

      {/* Progress */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {completedCount} / {totalCount} tasks completed
        </Text>
      </View>

      {/* Status message */}
      <Text style={[styles.statusText, allCompleted && styles.statusTextSuccess]}>
        {allCompleted
          ? 'All tasks completed! You can dismiss the alarm.'
          : 'Complete all tasks to dismiss the alarm.'}
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
        accessibilityLabel="Dismiss alarm"
        accessibilityState={{ disabled: !allCompleted }}
      >
        <Text style={[styles.dismissButtonText, !allCompleted && styles.dismissButtonTextDisabled]}>
          {allCompleted ? 'Dismiss Alarm' : 'Complete All Tasks'}
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
