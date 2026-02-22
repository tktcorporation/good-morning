import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, colors, fontSize, spacing } from '../src/constants/theme';
import { getSleepSummary, isHealthKitInitialized } from '../src/services/health';
import { playAlarmSound, stopAlarmSound } from '../src/services/sound';
import { useMorningSessionStore } from '../src/stores/morning-session-store';
import { useWakeRecordStore } from '../src/stores/wake-record-store';
import { useWakeTargetStore } from '../src/stores/wake-target-store';
import { formatTime } from '../src/types/alarm';
import type { SessionTodo } from '../src/types/morning-session';
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
  const clearNextOverride = useWakeTargetStore((s) => s.clearNextOverride);

  const addRecord = useWakeRecordStore((s) => s.addRecord);
  const updateRecord = useWakeRecordStore((s) => s.updateRecord);

  const startSession = useMorningSessionStore((s) => s.startSession);

  const todos = target?.todos ?? [];
  const resolvedTime = target !== null ? resolveTimeForDate(target, new Date()) : null;

  const [currentTime, setCurrentTime] = useState(new Date());

  const mountedAt = useRef(new Date());

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

  const handleDismiss = useCallback(() => {
    stopAlarmSound();
    Vibration.cancel();

    if (isDemo) {
      router.back();
      return;
    }

    if (target !== null && resolvedTime !== null) {
      const now = new Date();
      const diffMinutes = calculateDiffMinutes(resolvedTime, now);
      const result = calculateWakeResult(diffMinutes);
      const dateStr = formatDateString(now);
      const hasTodos = todos.length > 0;

      const todoRecords: readonly WakeTodoRecord[] = todos.map((todo) => ({
        id: todo.id,
        title: todo.title,
        completedAt: null,
        orderCompleted: null,
      }));

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
        todoCompletionSeconds: 0,
        alarmLabel: '',
        todosCompleted: !hasTodos,
        todosCompletedAt: hasTodos ? null : now.toISOString(),
      })
        .then((record) => {
          if (hasTodos) {
            const sessionTodos: readonly SessionTodo[] = todos.map((todo) => ({
              id: todo.id,
              title: todo.title,
              completed: false,
              completedAt: null,
            }));
            return startSession(record.id, dateStr, sessionTodos);
          }

          if (!isHealthKitInitialized()) return;
          return getSleepSummary(now).then((summary) => {
            if (summary === null) return;
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
  }, [
    target,
    resolvedTime,
    todos,
    isDemo,
    addRecord,
    updateRecord,
    startSession,
    clearNextOverride,
    router,
  ]);

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

      {/* Spacer */}
      <View style={styles.spacer} />

      {/* Dismiss button — always enabled */}
      <Pressable
        style={styles.dismissButton}
        onPress={handleDismiss}
        accessibilityRole="button"
        accessibilityLabel={isDemo ? t('demoComplete') : t('dismissAlarm')}
      >
        <Text style={styles.dismissButtonText}>
          {isDemo ? t('demoComplete') : t('dismissAlarm')}
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
  spacer: {
    flex: 1,
  },
  dismissButton: {
    backgroundColor: colors.success,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  dismissButtonText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  errorText: {
    color: colors.text,
    fontSize: fontSize.lg,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});
