import { StyleSheet } from 'react-native';
import type { WakeResult } from '../types/wake-record';

export const colors = {
  background: '#1a1a2e',
  surface: '#16213e',
  surfaceLight: '#0f3460',
  primary: '#e94560',
  primaryLight: '#ff6b81',
  text: '#ffffff',
  textSecondary: '#a0a0b0',
  textMuted: '#6b6b80',
  success: '#2ed573',
  warning: '#ffa502',
  border: '#2a2a4e',
  disabled: '#4a4a6a',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  time: 56,
} as const;

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
} as const;

export const RESULT_COLORS: Readonly<Record<WakeResult, string>> = {
  great: colors.success,
  ok: colors.success,
  late: colors.warning,
  missed: colors.primary,
};

export const semanticColors = {
  successLight: 'rgba(46, 213, 115, 0.15)',
  warningLight: 'rgba(255, 165, 2, 0.15)',
} as const;

export const commonStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
});
