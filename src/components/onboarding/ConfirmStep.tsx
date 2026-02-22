import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../../constants/theme';

interface ConfirmStepProps {
  readonly onConfirm: (enabled: boolean) => void;
  readonly onBack: () => void;
}

export function ConfirmStep({ onConfirm, onBack }: ConfirmStepProps) {
  const { t } = useTranslation('onboarding');

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('confirm.title')}</Text>
        <Text style={styles.subtitle}>{t('confirm.subtitle')}</Text>
      </View>

      <View style={styles.buttonsColumn}>
        <Pressable
          style={styles.enableButton}
          onPress={() => onConfirm(true)}
          accessibilityRole="button"
        >
          <Text style={styles.enableButtonText}>{t('confirm.enable')}</Text>
        </Pressable>

        <View style={styles.buttonsRow}>
          <Pressable style={styles.backButton} onPress={onBack} accessibilityRole="button">
            <Text style={styles.secondaryButtonText}>{t('back')}</Text>
          </Pressable>
          <Pressable
            style={styles.skipButton}
            onPress={() => onConfirm(false)}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>{t('confirm.skip')}</Text>
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
  enableButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  enableButtonText: {
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
  skipButton: {
    flex: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
});
