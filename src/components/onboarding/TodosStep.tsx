import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../../constants/theme';
import { StepButton } from './StepButton';
import { StepHeader } from './StepHeader';

interface TodosStepProps {
  readonly onNext: () => void;
  readonly onBack: () => void;
}

/**
 * オンボーディングの起床タスク説明ステップ。
 *
 * 起床タスクは「スクワット 10 回」固定（FIXED_SQUAT_TODO_ID 参照）のため、
 * 以前の自由入力 + プリセット chip による組み立て UI は廃止し、
 * 「何が設定されたか」をユーザーに伝える単純な説明画面にしている。
 */
export function TodosStep({ onNext, onBack }: TodosStepProps) {
  const { t } = useTranslation('onboarding');

  return (
    <View style={styles.container}>
      <StepHeader title={t('todos.title')} subtitle={t('todos.subtitle')} />

      <View style={styles.body}>
        <Text style={styles.icon}>{'🏋️'}</Text>
        <Text style={styles.taskLabel}>{t('todos.fixedTaskLabel')}</Text>
        <Text style={styles.helpText}>{t('todos.helpText')}</Text>
      </View>

      <View style={styles.buttons}>
        <StepButton label={t('back')} onPress={onBack} variant="secondary" flex={1} />
        <StepButton label={t('next')} onPress={onNext} variant="primary" flex={1} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: spacing.xl,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  icon: {
    fontSize: 72,
  },
  taskLabel: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '700',
    textAlign: 'center',
  },
  helpText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    textAlign: 'center',
    lineHeight: 24,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
});
