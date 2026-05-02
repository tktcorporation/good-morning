import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConfirmStep } from '../src/components/onboarding/ConfirmStep';
import { DemoStep } from '../src/components/onboarding/DemoStep';
import { PermissionStep } from '../src/components/onboarding/PermissionStep';
import { TimeStep } from '../src/components/onboarding/TimeStep';
import { TodosStep } from '../src/components/onboarding/TodosStep';
import { WelcomeStep } from '../src/components/onboarding/WelcomeStep';
import { colors, spacing } from '../src/constants/theme';
import { useWakeTargetStore } from '../src/stores/wake-target-store';
import type { AlarmTime } from '../src/types/alarm';
import { DEFAULT_WAKE_TARGET } from '../src/types/wake-target';

const STEP_KEYS = ['welcome', 'time', 'todos', 'permission', 'confirm', 'demo'] as const;
const TOTAL_STEPS = STEP_KEYS.length;

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setTarget = useWakeTargetStore((s) => s.setTarget);

  const [step, setStep] = useState(0);
  const [defaultTime, setDefaultTime] = useState<AlarmTime>({ hour: 7, minute: 0 });
  const [alarmEnabled, setAlarmEnabled] = useState(true);

  const handleNext = useCallback(() => {
    if (step < TOTAL_STEPS - 1) {
      setStep((s) => s + 1);
    }
  }, [step]);

  const handleBack = useCallback(() => {
    if (step > 0) {
      setStep((s) => s - 1);
    }
  }, [step]);

  const handleConfirm = useCallback(
    (enabled: boolean) => {
      setAlarmEnabled(enabled);
      handleNext();
    },
    [handleNext],
  );

  const handleComplete = useCallback(async () => {
    // todos は DEFAULT_WAKE_TARGET 経由で固定スクワット 1 件が継承される。
    // FIXED_SQUAT_TODO_ID 参照: ユーザーが自分でタスクを組み立てる仕組みは廃止済み。
    await setTarget({
      ...DEFAULT_WAKE_TARGET,
      defaultTime,
      enabled: alarmEnabled,
    });
    await AsyncStorage.setItem('onboarding-completed', 'true');
    router.replace('/');
  }, [defaultTime, setTarget, router, alarmEnabled]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.dots}>
        {STEP_KEYS.map((key, i) => (
          <View key={key} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.content}>
        {step === 0 && <WelcomeStep onNext={handleNext} />}
        {step === 1 && (
          <TimeStep
            onNext={handleNext}
            onBack={handleBack}
            time={defaultTime}
            setTime={setDefaultTime}
          />
        )}
        {step === 2 && <TodosStep onNext={handleNext} onBack={handleBack} />}
        {step === 3 && <PermissionStep onNext={handleNext} onBack={handleBack} />}
        {step === 4 && <ConfirmStep onConfirm={handleConfirm} onBack={handleBack} />}
        {step === 5 && <DemoStep onNext={handleComplete} onBack={handleBack} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 24,
  },
  content: {
    flex: 1,
  },
});
