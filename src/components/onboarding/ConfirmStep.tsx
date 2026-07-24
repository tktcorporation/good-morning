import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { spacing } from '../../constants/theme';
import { StepButton } from './StepButton';
import { StepHeader } from './StepHeader';

interface ConfirmStepProps {
  readonly onConfirm: (enabled: boolean) => void;
  readonly onBack: () => void;
}

export function ConfirmStep({ onConfirm, onBack }: ConfirmStepProps) {
  const { t } = useTranslation('onboarding');

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <StepHeader title={t('confirm.title')} subtitle={t('confirm.subtitle')} />
      </View>

      <View style={styles.buttonsColumn}>
        <StepButton label={t('confirm.enable')} onPress={() => onConfirm(true)} variant="primary" />

        <View style={styles.buttonsRow}>
          <StepButton label={t('back')} onPress={onBack} variant="secondary" flex={1} />
          <StepButton
            label={t('confirm.skip')}
            onPress={() => onConfirm(false)}
            variant="secondary"
            flex={1}
          />
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
