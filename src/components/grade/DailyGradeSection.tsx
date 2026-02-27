/**
 * 日次レビュー画面でその日のグレード詳細を表示するセクション。
 *
 * 背景: アラーム解除結果（朝）と就寝時刻（夜）の2軸評価を視覚的にまとめ、
 * ユーザーが「なぜそのグレードになったか」を理解できるようにする。
 *
 * 呼び出し元: app/day-review.tsx
 * DailyGradeRecord の構造が変われば表示ロジックも更新が必要。
 */

import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../../constants/theme';
import type { DailyGradeRecord } from '../../types/daily-grade';
import type { StreakState } from '../../types/streak';
import { GradeIcon } from './GradeIcon';
import { StreakBadge } from './StreakBadge';

interface DailyGradeSectionProps {
  /** その日のグレードレコード。未確定なら undefined */
  readonly gradeRecord: DailyGradeRecord | undefined;
  /** 現在のストリーク状態 */
  readonly streak: StreakState;
}

/**
 * グレード詳細セクション。
 * gradeRecord が undefined の場合は「未確定」メッセージを表示。
 * 確定済みの場合は大きなグレードアイコン + 朝夜の内訳 + StreakBadge を表示。
 */
export function DailyGradeSection({ gradeRecord, streak }: DailyGradeSectionProps) {
  const { t } = useTranslation('dashboard');

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{t('grade.title')}</Text>

      {gradeRecord === undefined ? (
        <Text style={styles.undetermined}>{t('grade.undetermined')}</Text>
      ) : (
        <>
          {/* 大きなグレードアイコン */}
          <View style={styles.gradeIconContainer}>
            <GradeIcon grade={gradeRecord.grade} size={48} />
          </View>

          {/* 朝の判定結果 */}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('grade.morning')}</Text>
            <Text style={styles.detailValue}>
              {gradeRecord.morningPass ? t('grade.morningPass') : t('grade.morningFail')}
            </Text>
          </View>

          {/* 夜の判定結果 */}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('grade.night')}</Text>
            <Text style={styles.detailValue}>
              {gradeRecord.bedtimeResult === 'onTime'
                ? t('grade.bedtimeOnTime')
                : gradeRecord.bedtimeResult === 'late'
                  ? t('grade.bedtimeLate')
                  : t('grade.bedtimeNoData')}
            </Text>
          </View>
        </>
      )}

      {/* ストリークバッジ（グレード確定の有無に関わらず表示） */}
      <View style={styles.streakContainer}>
        <StreakBadge
          currentStreak={streak.currentStreak}
          freezesAvailable={streak.freezesAvailable}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  undetermined: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  gradeIconContainer: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  detailLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  detailValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  streakContainer: {
    marginTop: spacing.md,
  },
});
