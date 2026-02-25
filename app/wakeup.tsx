import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, colors, fontSize, spacing } from '../src/constants/theme';
import {
  cancelAllAlarms,
  SNOOZE_DURATION_SECONDS,
  scheduleSnooze,
  startLiveActivity,
  updateLiveActivity,
} from '../src/services/alarm-kit';
import { getSleepSummary, isHealthKitInitialized } from '../src/services/health';
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

/**
 * スヌーズ再発火時の処理。既存セッションに未完了TODOがあれば次のスヌーズを再スケジュールする。
 * 新しいレコードやセッションは作成しない — 初回 dismiss 時に作成済みのものを継続利用する。
 */
function handleSnoozeRefire(): void {
  const sessionState = useMorningSessionStore.getState();
  if (sessionState.session !== null && !sessionState.areAllCompleted()) {
    scheduleAndStoreSnooze();

    // Update Live Activity with new snooze countdown
    const activityId = sessionState.liveActivityId;
    if (activityId !== null) {
      const newSnoozeFiresAt = new Date(Date.now() + SNOOZE_DURATION_SECONDS * 1000).toISOString();
      updateLiveActivity(
        activityId,
        sessionState.session.todos.map((t) => ({
          id: t.id,
          title: t.title,
          completed: t.completed,
        })),
        newSnoozeFiresAt,
      );
    }
  }
}

/**
 * スヌーズアラームをスケジュールし、ID と発火予定時刻をストアに保存する。
 * ID は cancelSnooze() でのキャンセルに、発火時刻はダッシュボードのカウントダウン表示に使われる。
 */
function scheduleAndStoreSnooze(): void {
  scheduleSnooze().then((snoozeId) => {
    if (snoozeId !== null) {
      const snoozeFiresAt = new Date(Date.now() + SNOOZE_DURATION_SECONDS * 1000).toISOString();
      useMorningSessionStore.getState().setSnoozeAlarmId(snoozeId);
      useMorningSessionStore.getState().setSnoozeFiresAt(snoozeFiresAt);
    }
  });
}

export default function WakeUpScreen() {
  const { t } = useTranslation('wakeup');
  const { t: tCommon } = useTranslation('common');
  const { demo, snooze } = useLocalSearchParams<{ demo?: string; snooze?: string }>();
  const isDemo = demo === 'true';
  // _layout.tsx が launch payload の isSnooze フラグを解析し、?snooze=true パラメータとして渡す
  const isSnooze = snooze === 'true';
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const target = useWakeTargetStore((s) => s.target);
  const clearNextOverride = useWakeTargetStore((s) => s.clearNextOverride);
  const alarmIds = useWakeTargetStore((s) => s.alarmIds);
  const setAlarmIds = useWakeTargetStore((s) => s.setAlarmIds);

  const addRecord = useWakeRecordStore((s) => s.addRecord);
  const updateRecord = useWakeRecordStore((s) => s.updateRecord);

  const startSession = useMorningSessionStore((s) => s.startSession);

  const dayBoundaryHour = useSettingsStore((s) => s.dayBoundaryHour);

  const todos = target?.todos ?? [];
  const resolvedTime = target !== null ? resolveTimeForDate(target, new Date()) : null;

  const [currentTime, setCurrentTime] = useState(new Date());

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

    // Handle snooze re-fire: don't create new record/session
    if (isSnooze) {
      handleSnoozeRefire();
      router.replace('/');
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
          if (hasTodos) {
            const sessionTodos: readonly SessionTodo[] = todos.map((todo) => ({
              id: todo.id,
              title: todo.title,
              completed: false,
              completedAt: null,
            }));
            startSession(record.id, dateStr, sessionTodos);

            // セッション開始直後にスヌーズをスケジュール。TODOが全完了する前に
            // ユーザーがアプリを離れても、9分後にアラームで呼び戻す。
            scheduleAndStoreSnooze();

            // セッション＋スヌーズの両方が確定してから Live Activity を開始する。
            // スヌーズの発火時刻をカウントダウン表示に使うため、この順序が必要。
            const liveActivityTodos = todos.map((td) => ({
              id: td.id,
              title: td.title,
              completed: false,
            }));
            const snoozeFiresAt = new Date(
              Date.now() + SNOOZE_DURATION_SECONDS * 1000,
            ).toISOString();
            startLiveActivity(liveActivityTodos, snoozeFiresAt).then((activityId) => {
              if (activityId !== null) {
                useMorningSessionStore.getState().setLiveActivityId(activityId);
              }
            });
            return;
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
    isSnooze,
    dayBoundaryHour,
    alarmIds,
    setAlarmIds,
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
