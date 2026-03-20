import '../src/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Effect } from 'effect';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, type AppStateStatus } from 'react-native';
import { colors } from '../src/constants/theme';
import {
  AlarmKit,
  checkLaunchPayload,
  handleAlarmEventEffect,
  runEffect,
  runEffectFork,
  syncAlarmsEffect,
  syncWidgetEffect,
} from '../src/services';
import { registerBackgroundSync } from '../src/services/background-sync';
import { useDailyGradeStore } from '../src/stores/daily-grade-store';
import { useMorningSessionStore } from '../src/stores/morning-session-store';
import { useSettingsStore } from '../src/stores/settings-store';
import { useWakeRecordStore } from '../src/stores/wake-record-store';
import { useWakeTargetStore } from '../src/stores/wake-target-store';

export default function RootLayout() {
  const { t } = useTranslation('dashboard');
  const { t: tCommon } = useTranslation('common');
  const router = useRouter();
  const loadTarget = useWakeTargetStore((s) => s.loadTarget);
  const loadRecords = useWakeRecordStore((s) => s.loadRecords);
  const loadSession = useMorningSessionStore((s) => s.loadSession);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const setAlarmKitGranted = useSettingsStore((s) => s.setAlarmKitGranted);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: initialization effect — runs once on mount
  useEffect(() => {
    const sessionLoaded = loadSession();
    const targetLoaded = loadTarget();
    const recordsLoaded = loadRecords();
    const settingsLoaded = loadSettings();
    const gradesLoaded = useDailyGradeStore.getState().loadGrades();

    // バックグラウンドフェッチ登録（fire-and-forget）
    registerBackgroundSync().catch(() => {});

    // 全ストアロード完了後に Effect ランタイムで初回ウィジェット同期
    Promise.all([sessionLoaded, targetLoaded, recordsLoaded, settingsLoaded, gradesLoaded])
      .then(() => runEffect(syncWidgetEffect))
      .catch(() => {});

    // AlarmKit の認可状態を Effect ランタイムで確認し、store に永続化
    runEffect(
      Effect.gen(function* () {
        const kit = yield* AlarmKit;
        return yield* kit.initialize;
      }),
    )
      .then((status) => {
        if (status === 'authorized') {
          setAlarmKitGranted(true);
        }
      })
      .catch(() => {});

    const coreLoaded = Promise.all([sessionLoaded, settingsLoaded]);

    // handleAlarmEvent を Effect 版に切り替え。
    // 従来の handleAlarmEvent と同じロジックだが、全副作用が Effect として型追跡される。
    const firstPayload = checkLaunchPayload();
    const waitFor = (() => {
      if (firstPayload === null) return Promise.all([coreLoaded, targetLoaded, recordsLoaded]);
      try {
        const parsed = JSON.parse(firstPayload.payload ?? '') as { isSnooze?: boolean };
        if (parsed.isSnooze === true) return sessionLoaded;
      } catch {}
      return coreLoaded;
    })();

    waitFor.then(async () => {
      await runEffect(
        handleAlarmEventEffect('cold-start', {
          routerPush: (path) => router.push(path),
          dayBoundaryHour: useSettingsStore.getState().dayBoundaryHour,
          clearExpiredOverride: () => useWakeTargetStore.getState().clearExpiredOverride(),
        }),
      );
      // アラーム状態を現在の target に同期する
      await runEffect(syncAlarmsEffect);
    });

    AsyncStorage.getItem('onboarding-completed').then((val) => {
      setOnboardingDone(val === 'true');
    });
  }, [loadTarget, loadRecords, loadSession, loadSettings]);

  useEffect(() => {
    if (onboardingDone === false) {
      router.replace('/onboarding');
    }
  }, [onboardingDone, router]);

  // バックグラウンド → フォアグラウンド復帰時にアラーム・スヌーズ状態を確認する。
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const wasBackground =
        appStateRef.current === 'inactive' || appStateRef.current === 'background';
      appStateRef.current = nextState;
      if (!wasBackground || nextState !== 'active') return;

      // Effect 版で処理。エラーは console.error に出力される。
      runEffectFork(
        handleAlarmEventEffect('foreground-resume', {
          routerPush: (path) => router.push(path),
          dayBoundaryHour: useSettingsStore.getState().dayBoundaryHour,
        }),
      );
    });
    return () => subscription.remove();
  }, [router]);

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
    </Stack>
  );
}
