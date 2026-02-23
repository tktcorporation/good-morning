import '../src/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Vibration } from 'react-native';
import { colors } from '../src/constants/theme';
import {
  cancelAllAlarms,
  checkLaunchPayload,
  initializeAlarmKit,
  scheduleWakeTargetAlarm,
} from '../src/services/alarm-kit';
import {
  addNotificationReceivedListener,
  addNotificationResponseListener,
  requestNotificationPermissions,
} from '../src/services/notifications';
import { playAlarmSound } from '../src/services/sound';
import { useMorningSessionStore } from '../src/stores/morning-session-store';
import { useSettingsStore } from '../src/stores/settings-store';
import { useWakeRecordStore } from '../src/stores/wake-record-store';
import { useWakeTargetStore } from '../src/stores/wake-target-store';

export default function RootLayout() {
  const { t } = useTranslation('dashboard');
  const { t: tCommon } = useTranslation('common');
  const router = useRouter();
  const target = useWakeTargetStore((s) => s.target);
  const setAlarmIds = useWakeTargetStore((s) => s.setAlarmIds);
  const loadTarget = useWakeTargetStore((s) => s.loadTarget);
  const resetTodos = useWakeTargetStore((s) => s.resetTodos);
  const loadRecords = useWakeRecordStore((s) => s.loadRecords);
  const updateRecord = useWakeRecordStore((s) => s.updateRecord);
  const loadSession = useMorningSessionStore((s) => s.loadSession);
  const clearSession = useMorningSessionStore((s) => s.clearSession);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: initialization effect — runs once on mount
  useEffect(() => {
    loadTarget();
    loadRecords();
    loadSession();
    loadSettings();
    requestNotificationPermissions();
    initializeAlarmKit();

    // Check if launched from alarm dismiss
    const payload = checkLaunchPayload();
    if (payload !== null) {
      router.push('/wakeup');
    }

    AsyncStorage.getItem('onboarding-completed').then((val) => {
      setOnboardingDone(val === 'true');
    });
  }, [loadTarget, loadRecords, loadSession, loadSettings]);

  useEffect(() => {
    if (onboardingDone === false) {
      router.replace('/onboarding');
    }
  }, [onboardingDone, router]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only reacting to target changes to avoid infinite loop
  useEffect(() => {
    if (target === null) return;

    if (target.enabled) {
      scheduleWakeTargetAlarm(target).then((newIds) => {
        setAlarmIds(newIds);
      });
    } else {
      cancelAllAlarms().then(() => {
        setAlarmIds([]);
      });
    }
  }, [target]);

  useEffect(() => {
    const VIBRATION_PATTERN = [500, 1000, 500, 1000];

    const handleAlarmTrigger = () => {
      // If there's an active session, finalize it as incomplete before starting new alarm
      const session = useMorningSessionStore.getState().session;
      if (session !== null) {
        const now = new Date().toISOString();
        const todoCompletionSeconds = Math.round(
          (new Date(now).getTime() - new Date(session.startedAt).getTime()) / 1000,
        );
        updateRecord(session.recordId, {
          todosCompleted: false,
          todosCompletedAt: now,
          todoCompletionSeconds,
          todos: session.todos.map((todo, index) => ({
            id: todo.id,
            title: todo.title,
            completedAt: todo.completedAt,
            orderCompleted: todo.completed ? index + 1 : null,
          })),
        }).then(() => clearSession());
      }

      const currentTarget = useWakeTargetStore.getState().target;
      resetTodos();
      playAlarmSound(currentTarget?.soundId);
      Vibration.vibrate(VIBRATION_PATTERN, true);
      router.push('/wakeup');
    };

    const responseSub = addNotificationResponseListener(handleAlarmTrigger);
    const receivedSub = addNotificationReceivedListener(handleAlarmTrigger);

    return () => {
      responseSub.remove();
      receivedSub.remove();
    };
  }, [router, resetTodos, updateRecord, clearSession]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="target-edit"
        options={{
          presentation: 'modal',
          title: t('targetEdit.title'),
        }}
      />
      <Stack.Screen
        name="schedule"
        options={{
          presentation: 'modal',
          title: tCommon('schedule.title'),
        }}
      />
      <Stack.Screen
        name="day-review"
        options={{
          presentation: 'modal',
          title: '',
        }}
      />
      <Stack.Screen
        name="wakeup"
        options={{
          headerShown: false,
          gestureEnabled: false,
          presentation: 'fullScreenModal',
        }}
      />
    </Stack>
  );
}
