import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, colors, fontSize, spacing } from '../src/constants/theme';
import {
  cancelAllAlarms,
  SNOOZE_DURATION_SECONDS,
  scheduleSnoozeAlarms,
  startLiveActivity,
} from '../src/services/alarm-kit';
import { playAlarmSound, stopAlarmSound } from '../src/services/sound';
import { useMorningSessionStore } from '../src/stores/morning-session-store';
import { useSettingsStore } from '../src/stores/settings-store';
import { useWakeRecordStore } from '../src/stores/wake-record-store';
import { useWakeTargetStore } from '../src/stores/wake-target-store';
import { formatTime } from '../src/types/alarm';
import type { SessionTodo } from '../src/types/morning-session';
import type { WakeTodoRecord } from '../src/types/wake-record';
import { calculateDiffMinutes, calculateWakeResult } from '../src/types/wake-record';
import { resolveTimeForDate } from '../src/types/wake-target';
import { getLogicalDateString } from '../src/utils/date';

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
  const alarmIds = useWakeTargetStore((s) => s.alarmIds);
  const setAlarmIds = useWakeTargetStore((s) => s.setAlarmIds);

  const addRecord = useWakeRecordStore((s) => s.addRecord);

  const startSession = useMorningSessionStore((s) => s.startSession);

  const dayBoundaryHour = useSettingsStore((s) => s.dayBoundaryHour);

  const todos = target?.todos ?? [];
  const resolvedTime = target !== null ? resolveTimeForDate(target, new Date()) : null;

  const [currentTime, setCurrentTime] = useState(new Date());
  const [dismissing, setDismissing] = useState(false);

  const mountedAt = useRef(new Date());

  // Start alarm sound and vibration
  useEffect(() => {
    if (isDemo) {
      playAlarmSound(target?.soundId);
      const timer = setTimeout(() => {
        stopAlarmSound();
      }, DEMO_SOUND_DURATION_MS);
      return () => {
        clearTimeout(timer);
        stopAlarmSound();
      };
    }

    // In non-demo mode, AlarmKit already played the system alarm.
    // Just start vibration as haptic feedback supplement.
    Vibration.vibrate(VIBRATION_PATTERN, true);

    return () => {
      Vibration.cancel();
    };
  }, [isDemo, target?.soundId]);

  // Update current time display
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleDismiss = useCallback(() => {
    if (dismissing) return;
    setDismissing(true);

    stopAlarmSound();
    Vibration.cancel();

    // Cancel remaining scheduled alarms
    if (alarmIds.length > 0) {
      cancelAllAlarms().then(() => {
        setAlarmIds([]);
      });
    }

    if (isDemo) {
      router.back();
      return;
    }

    if (target !== null && resolvedTime !== null) {
      const now = new Date();
      const diffMinutes = calculateDiffMinutes(resolvedTime, now);
      const result = calculateWakeResult(diffMinutes);
      const dateStr = getLogicalDateString(now, dayBoundaryHour);
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
          if (!hasTodos) return;

          const sessionTodos: readonly SessionTodo[] = todos.map((todo) => ({
            id: todo.id,
            title: todo.title,
            completed: false,
            completedAt: null,
          }));
          startSession(record.id, dateStr, sessionTodos);

          // セッション開始直後にスヌーズを先行スケジュール。
          // 先行スケジュール方式: dismiss 時点から9分間隔で最大20本（3時間分）を一括スケジュール。
          // iOS がアプリを起動しないケースでもネイティブ側で確実に発火する。
          const dismissTime = now;
          const snoozeFiresAt = new Date(
            dismissTime.getTime() + SNOOZE_DURATION_SECONDS * 1000,
          ).toISOString();
          scheduleSnoozeAlarms(dismissTime).then((snoozeIds) => {
            useMorningSessionStore.getState().setSnoozeAlarmIds(snoozeIds);
            useMorningSessionStore.getState().setSnoozeFiresAt(snoozeFiresAt);

            const liveActivityTodos = todos.map((td) => ({
              id: td.id,
              title: td.title,
              completed: false,
            }));
            startLiveActivity(liveActivityTodos, snoozeFiresAt).then(async (activityId) => {
              if (activityId !== null) {
                // await して AsyncStorage に永続化完了を保証する。
                // これにより、直後にアプリが kill されても再起動時に
                // loadSession() → cleanupStaleSession() で endLiveActivity できる。
                await useMorningSessionStore.getState().setLiveActivityId(activityId);
              }
            });
          });
        })
        .catch((e: unknown) => {
          // biome-ignore lint/suspicious/noConsole: dismiss フローを中断しないが、デバッグ用にエラーは記録する
          console.error('[WakeUp] Failed to save record:', e);
          // dismiss 自体は完了しているため、ユーザーに通知するが操作はブロックしない。
          // 次回のアラームで新しい WakeRecord が作成される。
          Alert.alert(t('error.title'), t('error.recordSaveFailed'));
        });
    }

    // 意図的な fire-and-forget: handleDismiss は同期コールバックのため await 不可。
    // AsyncStorage への永続化が遅延しても画面遷移に影響しない。
    void clearNextOverride();
    router.replace('/');
  }, [
    dismissing,
    target,
    resolvedTime,
    todos,
    isDemo,
    dayBoundaryHour,
    alarmIds,
    setAlarmIds,
    addRecord,
    startSession,
    clearNextOverride,
    router,
    t,
  ]);

  if (target === null) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.loadingText}>{tCommon('loading')}</Text>
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
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.lg,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});
