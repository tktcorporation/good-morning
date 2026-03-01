import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, colors, fontSize, spacing } from '../src/constants/theme';
import { cancelAllAlarms } from '../src/services/alarm-kit';
import { startMorningSession } from '../src/services/session-lifecycle';
import { playAlarmSound, stopAlarmSound } from '../src/services/sound';
import { useSettingsStore } from '../src/stores/settings-store';
import { useWakeTargetStore } from '../src/stores/wake-target-store';
import { formatTime } from '../src/types/alarm';
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
  const alarmIds = useWakeTargetStore((s) => s.alarmIds);
  const setAlarmIds = useWakeTargetStore((s) => s.setAlarmIds);

  const dayBoundaryHour = useSettingsStore((s) => s.dayBoundaryHour);

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
      // 意図的な fire-and-forget: セッション開始の全ステップを逐次実行する。
      // 画面遷移はブロックしない。エラー時はユーザーに通知する。
      startMorningSession({
        target,
        resolvedTime,
        dismissTime: new Date(),
        mountedAt: mountedAt.current,
        dayBoundaryHour,
      }).catch((e: unknown) => {
        // biome-ignore lint/suspicious/noConsole: dismiss フローを中断しないが、デバッグ用にエラーは記録する
        console.error('[WakeUp] Failed to start session:', e);
        Alert.alert(t('error.title'), t('error.recordSaveFailed'));
      });
    }

    // 意図的な fire-and-forget: AsyncStorage への永続化が遅延しても画面遷移に影響しない。
    void clearNextOverride();
    router.replace('/');
  }, [
    dismissing,
    target,
    resolvedTime,
    isDemo,
    dayBoundaryHour,
    alarmIds,
    setAlarmIds,
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
