import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { spacing } from '../../constants/theme';
import { StepButton } from './StepButton';
import { StepHeader } from './StepHeader';

interface DemoStepProps {
  readonly onNext: () => void;
  readonly onBack: () => void;
}

/**
 * オンボーディングのデモステップ。
 *
 * 背景: 以前は独自のアラーム画面(wakeup)のデモを表示していたが、
 * AlarmKit に一本化したため、オンボーディングの説明ステップとして残す。
 */
export function DemoStep({ onNext, onBack }: DemoStepProps) {
  const { t } = useTranslation('onboarding');

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <StepHeader title={t('demo.title')} subtitle={t('demo.subtitle')} />
      </View>

      <View style={styles.buttonsColumn}>
        <View style={styles.buttonsRow}>
          <StepButton label={t('back')} onPress={onBack} variant="secondary" flex={1} />
          <StepButton label={t('next')} onPress={onNext} variant="primary" flex={1} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: spacing.xl,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonsColumn: {
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});
