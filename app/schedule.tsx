import DateTimePicker from '@react-native-community/datetimepicker';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../src/constants/theme';
import { useWakeTargetStore } from '../src/stores/wake-target-store';
import type { DayOfWeek } from '../src/types/alarm';
import { formatTime, getDayLabel } from '../src/types/alarm';
import { resolveTimeForDate } from '../src/types/wake-target';

const ALL_DAYS: readonly DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

type DayState = 'default' | 'custom' | 'off';

function getDayState(
  day: DayOfWeek,
  dayOverrides: Readonly<Partial<Record<DayOfWeek, { readonly type: string }>>>,
): DayState {
  const override = dayOverrides[day];
  if (override === undefined) return 'default';
  if (override.type === 'off') return 'off';
  return 'custom';
}

export default function ScheduleScreen() {
  const { t } = useTranslation('common');
  const target = useWakeTargetStore((s) => s.target);
  const setDayOverride = useWakeTargetStore((s) => s.setDayOverride);
  const removeDayOverride = useWakeTargetStore((s) => s.removeDayOverride);
  const [editingDay, setEditingDay] = useState<DayOfWeek | null>(null);

  const defaultTime = target?.defaultTime ?? { hour: 7, minute: 0 };

  const pickerDate = useMemo(() => {
    if (editingDay === null || target === null) return new Date();
    const override = target.dayOverrides[editingDay];
    const time =
      override !== undefined && override.type === 'custom' ? override.time : defaultTime;
    const d = new Date();
    d.setHours(time.hour, time.minute, 0, 0);
    return d;
  }, [editingDay, target, defaultTime]);

  const handleDayPress = useCallback(
    async (day: DayOfWeek) => {
      if (target === null) return;
      const currentState = getDayState(day, target.dayOverrides);

      if (currentState === 'default') {
        // default -> custom: set a custom override with the default time initially
        await setDayOverride(day, { type: 'custom', time: defaultTime });
        setEditingDay(day);
      } else if (currentState === 'custom') {
        // custom -> off
        setEditingDay(null);
        await setDayOverride(day, { type: 'off' });
      } else {
        // off -> default: remove override
        setEditingDay(null);
        await removeDayOverride(day);
      }
    },
    [target, defaultTime, setDayOverride, removeDayOverride],
  );

  const handleTimeChange = useCallback(
    async (_event: unknown, selectedDate?: Date) => {
      if (editingDay === null || selectedDate === undefined) return;
      const hour = selectedDate.getHours();
      const minute = selectedDate.getMinutes();
      await setDayOverride(editingDay, { type: 'custom', time: { hour, minute } });
    },
    [editingDay, setDayOverride],
  );

  if (target === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>{t('loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.defaultTimeSection}>
        <Text style={styles.defaultTimeLabel}>{t('schedule.defaultTime')}</Text>
        <Text style={styles.defaultTimeValue}>{formatTime(defaultTime)}</Text>
      </View>

      <View style={styles.dayList}>
        {ALL_DAYS.map((day) => {
          const state = getDayState(day, target.dayOverrides);
          const testDate = new Date();
          testDate.setDate(testDate.getDate() + ((day - testDate.getDay() + 7) % 7));
          const resolvedTime = resolveTimeForDate(
            { ...target, nextOverride: null },
            testDate,
          );
          const hasOverride = state !== 'default';
          const isEditing = editingDay === day;

          return (
            <View key={day}>
              <Pressable
                style={[styles.dayRow, hasOverride && styles.dayRowOverride]}
                onPress={() => handleDayPress(day)}
              >
                <View style={styles.dayInfo}>
                  <Text style={styles.dayName}>{getDayLabel(day, t)}</Text>
                  <Text style={[styles.dayState, hasOverride && styles.dayStateOverride]}>
                    {state === 'default'
                      ? t('schedule.useDefault')
                      : state === 'custom'
                        ? t('schedule.customTime')
                        : t('schedule.off')}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.dayTime,
                    state === 'off' && styles.dayTimeOff,
                  ]}
                >
                  {resolvedTime !== null ? formatTime(resolvedTime) : t('schedule.off')}
                </Text>
              </Pressable>
              {isEditing && state === 'custom' && (
                <View style={styles.pickerContainer}>
                  <DateTimePicker
                    value={pickerDate}
                    mode="time"
                    display="spinner"
                    onChange={handleTimeChange}
                    themeVariant="dark"
                    textColor={colors.text}
                  />
                </View>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
  defaultTimeSection: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
  },
  defaultTimeLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  defaultTimeValue: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  dayList: {
    gap: spacing.sm,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
  },
  dayRowOverride: {
    backgroundColor: colors.surfaceLight,
  },
  dayInfo: {
    flexDirection: 'column',
    gap: spacing.xs,
  },
  dayName: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  dayState: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  dayStateOverride: {
    color: colors.primary,
  },
  dayTime: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.text,
  },
  dayTimeOff: {
    color: colors.textMuted,
  },
  pickerContainer: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: borderRadius.md,
    borderBottomRightRadius: borderRadius.md,
    marginTop: -spacing.sm,
    paddingBottom: spacing.sm,
  },
});
