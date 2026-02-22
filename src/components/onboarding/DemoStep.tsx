import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../../constants/theme';
import { StepButton } from './StepButton';

interface DemoStepProps {
  readonly onNext: () => void;
  readonly onBack: () => void;
}

export function DemoStep({ onNext, onBack }: DemoStepProps) {
  const { t } = useTranslation('onboarding');
  const router = useRouter();

  const handleStartDemo = () => {
    router.push('/wakeup?demo=true');
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('demo.title')}</Text>
        <Text style={styles.subtitle}>{t('demo.subtitle')}</Text>
      </View>

      <View style={styles.buttonsColumn}>
        <StepButton label={t('demo.start')} onPress={handleStartDemo} variant="primary" />

        <View style={styles.buttonsRow}>
          <StepButton label={t('back')} onPress={onBack} variant="secondary" flex={1} />
          <StepButton label={t('demo.skip')} onPress={onNext} variant="secondary" flex={1} />
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
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
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
