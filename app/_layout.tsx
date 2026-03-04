import '../src/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, type AppStateStatus } from 'react-native';
import { colors } from '../src/constants/theme';
import {
  cancelAlarmsByIds,
  cancelAllAlarms,
  checkLaunchPayload,
  initializeAlarmKit,
  scheduleWakeTargetAlarm,
} from '../src/services/alarm-kit';
import { registerBackgroundSync } from '../src/services/background-sync';
import { handleSnoozeArrival, restoreSessionOnLaunch } from '../src/services/session-lifecycle';
import { syncWidget } from '../src/services/widget-sync';
import { useDailyGradeStore } from '../src/stores/daily-grade-store';
import { useMorningSessionStore } from '../src/stores/morning-session-store';
import { useSettingsStore } from '../src/stores/settings-store';
import { useWakeRecordStore } from '../src/stores/wake-record-store';
import { useWakeTargetStore } from '../src/stores/wake-target-store';

/**
 * AlarmKit の LaunchPayload からスヌーズ経由かどうかを判定する。
 * scheduleSnooze() が payload に { isSnooze: true } を埋め込んでおり、
 * ここで解析して判定結果を返す。初期化 effect と AppState リスナーの両方で使用。
 */
function isSnoozePayload(payload: { payload: string | null } | null): boolean {
  if (payload === null || payload.payload === null) return false;
  try {
    const parsed = JSON.parse(payload.payload) as { isSnooze?: boolean };
    return parsed.isSnooze === true;
  } catch {
    return false;
  }
}

/**
 * バックグラウンド→フォアグラウンド復帰時のアラームペイロード処理。
 *
 * スヌーズペイロードなら Live Activity を更新し、
 * 初回アラームペイロードなら wakeup 画面に遷移して WakeRecord 作成を可能にする。
 *
 * 修正前: スヌーズのみ処理し、初回アラームペイロードを無視していたため、
 * アプリがバックグラウンドにいる状態でアラームが発火すると WakeRecord が作成されなかった。
 */
function handleAlarmResume(routerPush: (path: string) => void): void {
  const resumePayload = checkLaunchPayload();
  if (resumePayload === null) return;

  if (isSnoozePayload(resumePayload)) {
    handleSnoozeArrival();
  } else if (!useMorningSessionStore.getState().isActive()) {
    // 初回アラームペイロード: セッションがまだアクティブでなければ wakeup 画面へ遷移。
    // isActive() チェックにより、既に wakeup 画面で dismiss 済みの場合は二重遷移しない。
    restoreSessionOnLaunch(useSettingsStore.getState().dayBoundaryHour);
    routerPush('/wakeup');
  }
}

export default function RootLayout() {
  const { t } = useTranslation('dashboard');
  const { t: tCommon } = useTranslation('common');
  const router = useRouter();
  const target = useWakeTargetStore((s) => s.target);
  const setAlarmIds = useWakeTargetStore((s) => s.setAlarmIds);
  const loadTarget = useWakeTargetStore((s) => s.loadTarget);
  const loadRecords = useWakeRecordStore((s) => s.loadRecords);
  const loadSession = useMorningSessionStore((s) => s.loadSession);
  const sessionStoreLoaded = useMorningSessionStore((s) => s.loaded);
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

    const payload = checkLaunchPayload();
    if (payload !== null) {
      if (isSnoozePayload(payload)) {
        // スヌーズ再発火: ネイティブアラームがユーザーを起こし済み。
        // Live Activity を更新してダッシュボードへ。
        sessionLoaded.then(() => {
          handleSnoozeArrival();
          router.push('/');
        });
      } else {
        // 初回アラーム: stale セッションをクリーンアップしてから wakeup 画面へ
        coreLoaded.then(() => {
          restoreSessionOnLaunch(useSettingsStore.getState().dayBoundaryHour);
        });
        router.push('/wakeup');
      }
    } else {
      // アラーム経由でない通常起動。
      // targetLoaded を含めて、期限切れの nextOverride をクリアする。
      // アラーム起動時は wakeup 画面が resolvedTime を参照するためクリアしない。
      Promise.all([coreLoaded, targetLoaded]).then(() => {
        restoreSessionOnLaunch(useSettingsStore.getState().dayBoundaryHour);
        useWakeTargetStore.getState().clearExpiredOverride();
      });
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

      handleAlarmResume((path) => router.push(path));
    });
    return () => subscription.remove();
  }, [router]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reacting to target and sessionStoreLoaded changes only
  useEffect(() => {
    if (target === null) return;
    if (!sessionStoreLoaded) return;
    if (useMorningSessionStore.getState().isActive()) return;

    // target が短期間に複数回変更された場合、前回の非同期スケジュールが完了する前に
    // 次のスケジュールが開始される。cancelled フラグで前回の結果を無効化し、
    // 孤立アラーム（追跡されないアラーム）の蓄積を防ぐ。
    let cancelled = false;
    const { alarmIds } = useWakeTargetStore.getState();
    if (target.enabled) {
      scheduleWakeTargetAlarm(target, alarmIds).then((newIds) => {
        if (cancelled) {
          // 新しい effect が既に走っている — この結果は破棄してアラームもキャンセル
          void cancelAlarmsByIds(newIds);
          return;
        }
        setAlarmIds(newIds);
      });
    } else {
      cancelAllAlarms().then(() => {
        if (!cancelled) {
          setAlarmIds([]);
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [target, sessionStoreLoaded]);

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
