import '../src/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { colors } from '../src/constants/theme';
import {
  cancelAllAlarms,
  checkLaunchPayload,
  initializeAlarmKit,
  scheduleWakeTargetAlarm,
} from '../src/services/alarm-kit';
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
  const loadRecords = useWakeRecordStore((s) => s.loadRecords);
  const loadSession = useMorningSessionStore((s) => s.loadSession);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: initialization effect — runs once on mount
  useEffect(() => {
    loadTarget();
    loadRecords();
    loadSession();
    loadSettings();
    initializeAlarmKit();

    // AlarmKit の dismissPayload からスヌーズ経由かどうかを判定する。
    // scheduleSnooze() が payload に { isSnooze: true } を埋め込んでおり、
    // ここで解析して ?snooze=true パラメータとして wakeup 画面に渡す。
    const payload = checkLaunchPayload();
    if (payload !== null) {
      let isSnooze = false;
      if (payload.payload) {
        try {
          const parsed = JSON.parse(payload.payload) as { isSnooze?: boolean };
          isSnooze = parsed.isSnooze === true;
        } catch {
          /* ignore */
        }
      }
      router.push(isSnooze ? '/wakeup?snooze=true' : '/wakeup');
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
