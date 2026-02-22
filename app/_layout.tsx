import '../src/i18n';
import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { colors } from '../src/constants/theme';
import {
  addNotificationReceivedListener,
  addNotificationResponseListener,
  requestNotificationPermissions,
} from '../src/services/notifications';
import { useAlarmStore } from '../src/stores/alarm-store';
import { useWakeRecordStore } from '../src/stores/wake-record-store';

export default function RootLayout() {
  const { t } = useTranslation('alarm');
  const router = useRouter();
  const loadAlarms = useAlarmStore((s) => s.loadAlarms);
  const setActiveAlarm = useAlarmStore((s) => s.setActiveAlarm);
  const resetTodos = useAlarmStore((s) => s.resetTodos);
  const loadRecords = useWakeRecordStore((s) => s.loadRecords);

  useEffect(() => {
    loadAlarms();
    loadRecords();
    requestNotificationPermissions();
  }, [loadAlarms, loadRecords]);

  useEffect(() => {
    const handleAlarmTrigger = (alarmId: string) => {
      setActiveAlarm(alarmId);
      resetTodos(alarmId);
      router.push(`/wakeup/${alarmId}`);
    };

    const responseSub = addNotificationResponseListener(handleAlarmTrigger);
    const receivedSub = addNotificationReceivedListener(handleAlarmTrigger);

    return () => {
      responseSub.remove();
      receivedSub.remove();
    };
  }, [router, setActiveAlarm, resetTodos]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="alarm/create"
        options={{
          title: t('newAlarm'),
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="alarm/[id]"
        options={{
          title: t('editAlarm'),
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="wakeup/[id]"
        options={{
          headerShown: false,
          gestureEnabled: false,
          presentation: 'fullScreenModal',
        }}
      />
    </Stack>
  );
}
