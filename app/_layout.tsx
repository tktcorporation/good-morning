import '../src/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { colors } from '../src/constants/theme';
import {
  addNotificationReceivedListener,
  addNotificationResponseListener,
  requestNotificationPermissions,
} from '../src/services/notifications';
import { useWakeRecordStore } from '../src/stores/wake-record-store';
import { useWakeTargetStore } from '../src/stores/wake-target-store';

export default function RootLayout() {
  const { t } = useTranslation('dashboard');
  const { t: tCommon } = useTranslation('common');
  const router = useRouter();
  const loadTarget = useWakeTargetStore((s) => s.loadTarget);
  const resetTodos = useWakeTargetStore((s) => s.resetTodos);
  const loadRecords = useWakeRecordStore((s) => s.loadRecords);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    loadTarget();
    loadRecords();
    requestNotificationPermissions();
    AsyncStorage.getItem('onboarding-completed').then((val) => {
      setOnboardingDone(val === 'true');
    });
  }, [loadTarget, loadRecords]);

  useEffect(() => {
    if (onboardingDone === false) {
      router.replace('/onboarding');
    }
  }, [onboardingDone, router]);

  useEffect(() => {
    const handleAlarmTrigger = () => {
      resetTodos();
      router.push('/wakeup');
    };

    const responseSub = addNotificationResponseListener(handleAlarmTrigger);
    const receivedSub = addNotificationReceivedListener(handleAlarmTrigger);

    return () => {
      responseSub.remove();
      receivedSub.remove();
    };
  }, [router, resetTodos]);

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
