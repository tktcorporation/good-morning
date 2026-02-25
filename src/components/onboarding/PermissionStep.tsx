import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../../constants/theme';
import { initializeAlarmKit } from '../../services/alarm-kit';
import { StepButton } from './StepButton';
import { StepHeader } from './StepHeader';

interface PermissionStepProps {
  readonly onNext: () => void;
  readonly onBack: () => void;
}

export function PermissionStep({ onNext, onBack }: PermissionStepProps) {
  const { t } = useTranslation('onboarding');
  const [granted, setGranted] = useState(false);

  const handleAllow = async () => {
    const status = await initializeAlarmKit();
    const result = status === 'authorized';
    setGranted(result);
    if (result) {
      onNext();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <StepHeader title={t('permission.title')} subtitle={t('permission.subtitle')} />
      </View>

      <View style={styles.buttons}>
        <StepButton label={t('back')} onPress={onBack} variant="secondary" flex={1} />
        <StepButton
          label={granted ? t('next') : t('permission.allow')}
          onPress={granted ? onNext : handleAllow}
          variant="primary"
          flex={2}
          style={granted ? { backgroundColor: colors.success } : undefined}
        />
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
  buttons: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
});
