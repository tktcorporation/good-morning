import '../src/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, type AppStateStatus } from 'react-native';
import { colors } from '../src/constants/theme';
import { checkLaunchPayload, initializeAlarmKit } from '../src/services/alarm-kit';
import { syncAlarms } from '../src/services/alarm-sync';
import { registerBackgroundSync } from '../src/services/background-sync';
import { handleAlarmEvent } from '../src/services/session-lifecycle';
import { syncWidget } from '../src/services/widget-sync';
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
    // handleSnoozeRefire() がセッション情報を参照するため、
    // loadSession の Promise を保持してスヌーズ処理前に await する。
    // 他の load も Promise を保持し、全完了後にウィジェット初回同期を行う。
    const sessionLoaded = loadSession();
    const targetLoaded = loadTarget();
    const recordsLoaded = loadRecords();
    const settingsLoaded = loadSettings();
    // グレード履歴をアプリ起動時にロード。ダッシュボードの useGradeFinalization が
    // loaded フラグを参照するため、ルートレイアウトで先行ロードしておく。
    const gradesLoaded = useDailyGradeStore.getState().loadGrades();

    // バックグラウンドフェッチ登録（fire-and-forget）
    registerBackgroundSync().catch(() => {});

    // 全ストアロード完了後に初回ウィジェットデータ同期
    Promise.all([sessionLoaded, targetLoaded, recordsLoaded, settingsLoaded, gradesLoaded])
      .then(() => syncWidget())
      .catch(() => {});
    // initializeAlarmKit の結果を store に永続化して、設定画面で権限状態を正しく復元する。
    // HealthKit は settings.healthKitEnabled で管理済みだが、AlarmKit は未管理だったため追加。
    initializeAlarmKit().then((status) => {
      if (status === 'authorized') {
        setAlarmKitGranted(true);
      }
    });

    // restoreSessionOnLaunch は dayBoundaryHour を参照するため、設定ロード完了を待つ。
    // 設定ロード前にデフォルト値で判定すると、ユーザーが dayBoundaryHour を変更していた場合に
    // 同日のセッションを誤って「期限切れ」と判定してクリアしてしまう。
    const coreLoaded = Promise.all([sessionLoaded, settingsLoaded]);

    // handleAlarmEvent に payload 判定・ルーティングを一元委譲。
    // スヌーズは sessionLoaded のみ待てば十分（セッション状態を参照するため）。
    // 初回アラームは coreLoaded（session + settings）を待つ。
    // 通常起動は targetLoaded + recordsLoaded も待って clearExpiredOverride を実行。
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
      await handleAlarmEvent('cold-start', {
        routerPush: (path) => router.push(path),
        dayBoundaryHour: useSettingsStore.getState().dayBoundaryHour,
        clearExpiredOverride: () => useWakeTargetStore.getState().clearExpiredOverride(),
      });
      // アラーム状態を現在の target に同期する。
      // handleAlarmEvent でセッションが開始された場合は no-op（スヌーズ管理中）。
      // セッション未開始の場合はアラームを target に合わせて再スケジュールする。
      await syncAlarms();
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
  // AlarmKit がアプリを起動する場合は初期化 effect（上）で処理されるが、
  // アプリが kill されずバックグラウンドにいた場合は初期化 effect が再実行されない。
  // そのケースでは handleAlarmResume でペイロードを検知し、適切な画面に遷移する。
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const wasBackground =
        appStateRef.current === 'inactive' || appStateRef.current === 'background';
      appStateRef.current = nextState;
      if (!wasBackground || nextState !== 'active') return;

      handleAlarmEvent('foreground-resume', {
        routerPush: (path) => router.push(path),
        dayBoundaryHour: useSettingsStore.getState().dayBoundaryHour,
      });
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
