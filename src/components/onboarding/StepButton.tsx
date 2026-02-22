import { Pressable, type PressableProps, StyleSheet, Text, type ViewStyle } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../../constants/theme';

interface StepButtonProps extends Pick<PressableProps, 'disabled'> {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant: 'primary' | 'secondary';
  readonly flex?: number;
  readonly style?: ViewStyle;
}

export function StepButton({ label, onPress, variant, flex, disabled, style }: StepButtonProps) {
  return (
    <Pressable
      style={[
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        flex !== undefined ? { flex } : undefined,
        style,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      disabled={disabled}
    >
      <Text style={[styles.text, variant === 'secondary' && styles.textSecondary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  textSecondary: {
    color: colors.textSecondary,
  },
});
