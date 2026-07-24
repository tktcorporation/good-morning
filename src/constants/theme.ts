import { StyleSheet } from 'react-native';
import type { WakeResult } from '../types/wake-record';

// グレード色は react-native 非依存の grade-symbols を SSOT とし、UI 側の慣用名で
// 再エクスポートする（消費者は theme から import 済みのため名前を維持）。
export {
  GRADE_COLORS_MAP as GRADE_COLORS,
  GRADE_UNDETERMINED_COLOR_VALUE as GRADE_UNDETERMINED_COLOR,
} from './grade-symbols';

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
  /** デバッグ表示等、8px グリッドの粒度では粗すぎる箇所向けの最小刻み */
  xxs: 2,
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
  /**
   * 時刻表示の time (56) と同サイズだが、時刻専用ではない大型見出し用。
   * time と分離することで、時刻表示のサイズ変更が非時刻テキストへ波及しない。
   */
  display: 56,
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
  errorLight: 'rgba(233, 69, 96, 0.15)',
  /** モーダル/ボトムシートの背後を暗く覆う半透明オーバーレイの共通色 */
  overlay: 'rgba(0, 0, 0, 0.5)',
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
  /** チェックボックス付きリスト行など、行単位のコンパクトなカード（TodoListItem / SquatChallengeItem 共通） */
  listItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  // ボトムシート風モーダル（DayBoundaryPicker / SleepDurationPickerModal 共通パターン）
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: semanticColors.overlay,
    justifyContent: 'flex-end',
  },
  bottomSheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '70%',
  },
  bottomSheetTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    textAlign: 'center',
  },
  bottomSheetList: {
    marginBottom: spacing.md,
  },
  bottomSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
  },
  bottomSheetItemSelected: {
    backgroundColor: colors.surfaceLight,
  },
  bottomSheetItemText: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  bottomSheetItemTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  bottomSheetCheckmark: {
    color: colors.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  bottomSheetTextButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bottomSheetTextButtonLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  bottomSheetPrimaryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  bottomSheetPrimaryButtonLabel: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
