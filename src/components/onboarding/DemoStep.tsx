import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../../constants/theme';

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
        <Pressable style={styles.demoButton} onPress={handleStartDemo} accessibilityRole="button">
          <Text style={styles.demoButtonText}>{t('demo.start')}</Text>
        </Pressable>

        <View style={styles.buttonsRow}>
          <Pressable style={styles.backButton} onPress={onBack} accessibilityRole="button">
            <Text style={styles.backButtonText}>{t('back')}</Text>
          </Pressable>
          <Pressable style={styles.skipButton} onPress={onNext} accessibilityRole="button">
            <Text style={styles.skipButtonText}>{t('demo.skip')}</Text>
          </Pressable>
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
  demoButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  demoButtonText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  backButton: {
    flex: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  backButtonText: {
    color: colors.textSecondary,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  skipButton: {
    flex: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  skipButtonText: {
    color: colors.textSecondary,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
});
