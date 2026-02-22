import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DemoStep } from '../src/components/onboarding/DemoStep';
import { PermissionStep } from '../src/components/onboarding/PermissionStep';
import { TimeStep } from '../src/components/onboarding/TimeStep';
import { TodosStep } from '../src/components/onboarding/TodosStep';
import { WelcomeStep } from '../src/components/onboarding/WelcomeStep';
import { colors, spacing } from '../src/constants/theme';
import { useWakeTargetStore } from '../src/stores/wake-target-store';
import type { AlarmTime } from '../src/types/alarm';
import { DEFAULT_WAKE_TARGET } from '../src/types/wake-target';

const TOTAL_STEPS = 5;

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setTarget = useWakeTargetStore((s) => s.setTarget);

  const [step, setStep] = useState(0);
  const [defaultTime, setDefaultTime] = useState<AlarmTime>({ hour: 7, minute: 0 });
  const [todos, setTodos] = useState<readonly string[]>([]);

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

  const handleComplete = useCallback(async () => {
    const todoItems = todos.map((title, index) => ({
      id: `todo_onboarding_${index}_${Date.now()}`,
      title,
      completed: false,
    }));

    await setTarget({
      ...DEFAULT_WAKE_TARGET,
      defaultTime,
      todos: todoItems,
    });
    await AsyncStorage.setItem('onboarding-completed', 'true');
    router.replace('/');
  }, [defaultTime, todos, setTarget, router]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.dots}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
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
        {step === 2 && (
          <TodosStep onNext={handleNext} onBack={handleBack} todos={todos} setTodos={setTodos} />
        )}
        {step === 3 && <PermissionStep onNext={handleNext} onBack={handleBack} />}
        {step === 4 && <DemoStep onNext={handleComplete} onBack={handleBack} />}
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
