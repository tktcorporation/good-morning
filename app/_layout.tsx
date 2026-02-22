import '../src/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Vibration } from 'react-native';
import { colors } from '../src/constants/theme';
import {
  addNotificationReceivedListener,
  addNotificationResponseListener,
  cancelAlarmNotifications,
  requestNotificationPermissions,
  scheduleWakeTargetNotifications,
} from '../src/services/notifications';
import { playAlarmSound } from '../src/services/sound';
import { useMorningSessionStore } from '../src/stores/morning-session-store';
import { useWakeRecordStore } from '../src/stores/wake-record-store';
import { useWakeTargetStore } from '../src/stores/wake-target-store';

export default function RootLayout() {
  const { t } = useTranslation('dashboard');
  const { t: tCommon } = useTranslation('common');
  const router = useRouter();
  const target = useWakeTargetStore((s) => s.target);
  const notificationIds = useWakeTargetStore((s) => s.notificationIds);
  const setNotificationIds = useWakeTargetStore((s) => s.setNotificationIds);
  const loadTarget = useWakeTargetStore((s) => s.loadTarget);
  const resetTodos = useWakeTargetStore((s) => s.resetTodos);
  const loadRecords = useWakeRecordStore((s) => s.loadRecords);
  const updateRecord = useWakeRecordStore((s) => s.updateRecord);
  const loadSession = useMorningSessionStore((s) => s.loadSession);
  const clearSession = useMorningSessionStore((s) => s.clearSession);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    loadTarget();
    loadRecords();
    loadSession();
    requestNotificationPermissions();
    AsyncStorage.getItem('onboarding-completed').then((val) => {
      setOnboardingDone(val === 'true');
    });
  }, [loadTarget, loadRecords, loadSession]);

  useEffect(() => {
    if (onboardingDone === false) {
      router.replace('/onboarding');
    }
  }, [onboardingDone, router]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only reacting to target changes to avoid infinite loop
  useEffect(() => {
    if (target === null) return;

    if (target.enabled) {
      scheduleWakeTargetNotifications(target, notificationIds).then((newIds) => {
        setNotificationIds(newIds);
      });
    } else {
      if (notificationIds.length > 0) {
        cancelAlarmNotifications(notificationIds).then(() => {
          setNotificationIds([]);
        });
      }
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

      resetTodos();
      playAlarmSound();
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
