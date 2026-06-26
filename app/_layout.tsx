import '../src/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Effect } from 'effect';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, type AppStateStatus } from 'react-native';
import { STORAGE_KEYS } from '../src/constants/storage-keys';
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
import { isSnoozePayload } from '../src/services/session/types';
import { useDailyGradeStore } from '../src/stores/daily-grade-store';
import { useMorningSessionStore } from '../src/stores/morning-session-store';
import { useSettingsStore } from '../src/stores/settings-store';
import { useWakeRecordStore } from '../src/stores/wake-record-store';
import { useWakeTargetStore } from '../src/stores/wake-target-store';

/**
 * 起動時の fire-and-forget 初期化の失敗をログに出して可視化する。
 * 握り潰すと初回同期・認可確認の失敗が無言で消え、原因調査が困難になる。
 */
function logInitError(context: string): (error: unknown) => void {
  return (error) => {
    // biome-ignore lint/suspicious/noConsole: 起動時初期化の失敗を握り潰さず可視化する
    console.error(`[RootLayout] ${context} failed`, error);
  };
}

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
    registerBackgroundSync().catch(logInitError('registerBackgroundSync'));

    // 全ストアロード完了後に Effect ランタイムで初回ウィジェット同期
    Promise.all([sessionLoaded, targetLoaded, recordsLoaded, settingsLoaded, gradesLoaded])
      .then(() => runEffect(syncWidgetEffect))
      .catch(logInitError('initial widget sync'));

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
      .catch(logInitError('AlarmKit initialize'));

    const coreLoaded = Promise.all([sessionLoaded, settingsLoaded]);

    // スヌーズ経由の cold-start のみ session ロードを待てば足りる。
    // それ以外は core（session + settings）を待ってからアラームイベントを処理する。
    const firstPayload = checkLaunchPayload();
    const waitFor = (() => {
      if (firstPayload === null) return Promise.all([coreLoaded, targetLoaded, recordsLoaded]);
      if (isSnoozePayload(firstPayload)) return sessionLoaded;
      return coreLoaded;
    })();

    waitFor
      .then(async () => {
        await runEffect(
          handleAlarmEventEffect('cold-start', {
            routerPush: (path) => router.push(path),
            dayBoundaryHour: useSettingsStore.getState().dayBoundaryHour,
            clearExpiredOverride: () => useWakeTargetStore.getState().clearExpiredOverride(),
          }),
        );
        // アラーム状態を現在の target に同期する
        await runEffect(syncAlarmsEffect);
      })
      .catch(logInitError('cold-start alarm handling'));

    AsyncStorage.getItem(STORAGE_KEYS.onboardingCompleted)
      .then((val) => {
        setOnboardingDone(val === 'true');
      })
      .catch(logInitError('load onboarding flag'));
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
      <Stack.Screen
        name="squat-check"
        options={{
          presentation: 'modal',
          title: tCommon('squatCheck.title'),
        }}
      />
    </Stack>
  );
}
