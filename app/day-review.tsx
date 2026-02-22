import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../src/constants/theme';
import { useWakeRecordStore } from '../src/stores/wake-record-store';
import { formatTime } from '../src/types/alarm';
import type { WakeResult } from '../src/types/wake-record';

const RESULT_COLORS: Readonly<Record<WakeResult, string>> = {
  great: colors.success,
  ok: colors.success,
  late: colors.warning,
  missed: colors.primary,
};

const RESULT_LABELS: Readonly<Record<WakeResult, string>> = {
  great: 'Great',
  ok: 'OK',
  late: 'Late',
  missed: 'Missed',
};

export default function DayReviewScreen() {
  const { t } = useTranslation('dashboard');
  const { date } = useLocalSearchParams<{ readonly date: string }>();
  const records = useWakeRecordStore((s) => s.records);

  const record = useMemo(
    () => records.find((r) => r.date === date),
    [records, date],
  );

  if (record === undefined) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.noRecordText}>{t('review.noRecord')}</Text>
        </View>
      </View>
    );
  }

  const resultColor = RESULT_COLORS[record.result];
  const resultLabel = RESULT_LABELS[record.result];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.dateTitle}>
        {t('review.title', { date: date ?? '' })}
      </Text>

      {/* Result Badge */}
      <View style={[styles.resultBadge, { backgroundColor: resultColor }]}>
        <Text style={styles.resultBadgeText}>{resultLabel}</Text>
      </View>

      {/* Time Info */}
      <View style={styles.infoSection}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('review.target')}</Text>
          <Text style={styles.infoValue}>{formatTime(record.targetTime)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('review.actual')}</Text>
          <Text style={styles.infoValue}>
            {new Date(record.dismissedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('review.result')}</Text>
          <Text style={[styles.infoValue, { color: resultColor }]}>
            {record.diffMinutes > 0
              ? `+${Math.round(record.diffMinutes)} min`
              : `${Math.round(record.diffMinutes)} min`}
          </Text>
        </View>
      </View>

      {/* Todo Completion */}
      {record.todos.length > 0 && (
        <View style={styles.todosSection}>
          <Text style={styles.sectionTitle}>{t('review.todos')}</Text>
          {record.todos.map((todo) => (
            <View key={todo.id} style={styles.todoRow}>
              <Text style={styles.todoCheckmark}>
                {todo.completedAt !== null ? '✓' : '○'}
              </Text>
              <Text
                style={[
                  styles.todoText,
                  todo.completedAt !== null && styles.todoCompleted,
                ]}
              >
                {todo.title}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noRecordText: {
    color: colors.textMuted,
    fontSize: fontSize.lg,
  },
  dateTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },

  // Result Badge
  resultBadge: {
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    marginBottom: spacing.xl,
  },
  resultBadgeText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },

  // Info Section
  infoSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  infoLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  infoValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },

  // Todos Section
  todosSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  todoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  todoCheckmark: {
    color: colors.success,
    fontSize: fontSize.md,
    marginRight: spacing.md,
    width: 20,
  },
  todoText: {
    color: colors.text,
    fontSize: fontSize.md,
    flex: 1,
  },
  todoCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
});
