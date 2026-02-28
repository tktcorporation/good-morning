import '../src/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, type AppStateStatus } from 'react-native';
import { colors } from '../src/constants/theme';
import {
  cancelAllAlarms,
  checkLaunchPayload,
  endLiveActivity,
  initializeAlarmKit,
  scheduleWakeTargetAlarm,
} from '../src/services/alarm-kit';
import { handleSnoozeArrival } from '../src/services/snooze';
import { useDailyGradeStore } from '../src/stores/daily-grade-store';
import { useMorningSessionStore } from '../src/stores/morning-session-store';
import { useSettingsStore } from '../src/stores/settings-store';
import { useWakeRecordStore } from '../src/stores/wake-record-store';
import { useWakeTargetStore } from '../src/stores/wake-target-store';
import { getLogicalDateString } from '../src/utils/date';

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
  const setAlarmKitGranted = useSettingsStore((s) => s.setAlarmKitGranted);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: initialization effect — runs once on mount
  useEffect(() => {
    // handleSnoozeRefire() がセッション情報を参照するため、
    // loadSession の Promise を保持してスヌーズ処理前に await する。
    // 他の load は互いに独立しているため fire-and-forget で問題ない。
    const sessionLoaded = loadSession();
    loadTarget();
    loadRecords();
    loadSettings();
    // グレード履歴をアプリ起動時にロード。ダッシュボードの useGradeFinalization が
    // loaded フラグを参照するため、ルートレイアウトで先行ロードしておく。
    useDailyGradeStore.getState().loadGrades();
    // initializeAlarmKit の結果を store に永続化して、設定画面で権限状態を正しく復元する。
    // HealthKit は settings.healthKitEnabled で管理済みだが、AlarmKit は未管理だったため追加。
    initializeAlarmKit().then((status) => {
      if (status === 'authorized') {
        setAlarmKitGranted(true);
      }
    });

    const payload = checkLaunchPayload();
    if (payload !== null) {
      if (isSnoozePayload(payload)) {
        // スヌーズ再発火: wakeup 画面を表示せず自動処理する。
        // ネイティブアラームが既にユーザーを起こしているため、アプリ側では
        // Live Activity を更新してダッシュボードへ遷移するだけ。
        // 先行スケジュール方式により再スケジュールは不要。
        sessionLoaded.then(() => {
          handleSnoozeArrival();
          router.push('/');
        });
      } else {
        // 初回アラーム: 古いセッションが残っていればクリーンアップしてから wakeup 画面へ
        sessionLoaded.then(() => {
          const state = useMorningSessionStore.getState();
          if (state.session !== null) {
            const dayBoundaryHour = useSettingsStore.getState().dayBoundaryHour;
            const today = getLogicalDateString(new Date(), dayBoundaryHour);
            if (state.session.date !== today) {
              if (state.session.liveActivityId !== null) {
                endLiveActivity(state.session.liveActivityId);
              }
              state.clearSession();
            }
          }
        });
        router.push('/wakeup');
      }
    } else {
      // アラーム経由でない通常起動（ホーム画面タップ等）の場合。
      // 先行スケジュール方式ではスヌーズはアラーム設定時に一括スケジュール済みのため、
      // 復元処理は不要。
      //
      // セッションがアクティブだがTODO全完了済みの場合、
      // 前回のアプリ kill で endLiveActivity が呼ばれなかった可能性がある。
      // その場合はここで Live Activity を終了してロック画面から除去する。
      sessionLoaded.then(() => {
        const state = useMorningSessionStore.getState();
        if (
          state.session !== null &&
          state.areAllCompleted() &&
          state.session.liveActivityId !== null
        ) {
          endLiveActivity(state.session.liveActivityId);
        }
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

  // バックグラウンド → フォアグラウンド復帰時にスヌーズ状態を確認する。
  // AlarmKit がアプリを起動する場合は初期化 effect（上）で処理されるが、
  // アプリが kill されずバックグラウンドにいた場合は初期化 effect が再実行されない。
  // そのケースでは checkLaunchPayload でスヌーズ再発火を検知し、Live Activity を更新する。
  // 先行スケジュール方式のため再スケジュールは不要。
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const wasBackground =
        appStateRef.current === 'inactive' || appStateRef.current === 'background';
      appStateRef.current = nextState;
      if (!wasBackground || nextState !== 'active') return;

      const resumePayload = checkLaunchPayload();
      if (isSnoozePayload(resumePayload)) {
        handleSnoozeArrival();
      }
    });
    return () => subscription.remove();
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only reacting to target changes to avoid infinite loop
  useEffect(() => {
    if (target === null) return;

    // アクティブセッション中は target 変更によるアラーム再スケジュールをスキップ。
    // cancelAllAlarms がスヌーズを巻き添えでキャンセルしてしまうのを防ぐ。
    // セッション完了後の completion effect (index.tsx) で再スケジュールされる。
    if (useMorningSessionStore.getState().isActive()) return;

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
