import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../../constants/theme';
import { requestNotificationPermissions } from '../../services/notifications';

interface PermissionStepProps {
  readonly onNext: () => void;
  readonly onBack: () => void;
}

export function PermissionStep({ onNext, onBack }: PermissionStepProps) {
  const { t } = useTranslation('onboarding');
  const [granted, setGranted] = useState(false);

  const handleAllow = async () => {
    const result = await requestNotificationPermissions();
    setGranted(result);
    if (result) {
      onNext();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('permission.title')}</Text>
        <Text style={styles.subtitle}>{t('permission.subtitle')}</Text>
      </View>

      <View style={styles.buttons}>
        <Pressable style={styles.backButton} onPress={onBack} accessibilityRole="button">
          <Text style={styles.backButtonText}>{t('back')}</Text>
        </Pressable>
        <Pressable
          style={[styles.allowButton, granted && styles.allowButtonGranted]}
          onPress={granted ? onNext : handleAllow}
          accessibilityRole="button"
        >
          <Text style={styles.allowButtonText}>{granted ? t('next') : t('permission.allow')}</Text>
        </Pressable>
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
  buttons: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
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
  allowButton: {
    flex: 2,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  allowButtonGranted: {
    backgroundColor: colors.success,
  },
  allowButtonText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
});
