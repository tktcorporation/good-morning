import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../src/constants/theme';
import { useWakeTargetStore } from '../src/stores/wake-target-store';
import type { AlarmTime, DayOfWeek, TranslateFn } from '../src/types/alarm';
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

function InlineTimePicker({
  time,
  onChange,
}: {
  readonly time: AlarmTime;
  readonly onChange: (time: AlarmTime) => void;
}) {
  const adjustHour = (delta: number) => {
    const hour = (time.hour + delta + 24) % 24;
    onChange({ ...time, hour });
  };

  const adjustMinute = (delta: number) => {
    const minute = (time.minute + delta * 5 + 60) % 60;
    onChange({ ...time, minute });
  };

  return (
    <View style={pickerStyles.container}>
      <View style={pickerStyles.column}>
        <Pressable style={pickerStyles.button} onPress={() => adjustHour(1)}>
          <Text style={pickerStyles.buttonText}>{'▲'}</Text>
        </Pressable>
        <Text style={pickerStyles.display}>{time.hour.toString().padStart(2, '0')}</Text>
        <Pressable style={pickerStyles.button} onPress={() => adjustHour(-1)}>
          <Text style={pickerStyles.buttonText}>{'▼'}</Text>
        </Pressable>
      </View>
      <Text style={pickerStyles.separator}>{':'}</Text>
      <View style={pickerStyles.column}>
        <Pressable style={pickerStyles.button} onPress={() => adjustMinute(1)}>
          <Text style={pickerStyles.buttonText}>{'▲'}</Text>
        </Pressable>
        <Text style={pickerStyles.display}>{time.minute.toString().padStart(2, '0')}</Text>
        <Pressable style={pickerStyles.button} onPress={() => adjustMinute(-1)}>
          <Text style={pickerStyles.buttonText}>{'▼'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function ScheduleScreen() {
  const { t } = useTranslation('common');
  const target = useWakeTargetStore((s) => s.target);
  const setDayOverride = useWakeTargetStore((s) => s.setDayOverride);
  const removeDayOverride = useWakeTargetStore((s) => s.removeDayOverride);
  const [editingDay, setEditingDay] = useState<DayOfWeek | null>(null);

  const defaultTime = target?.defaultTime ?? { hour: 7, minute: 0 };

  const handleDayPress = useCallback(
    async (day: DayOfWeek) => {
      if (target === null) return;
      const currentState = getDayState(day, target.dayOverrides);

      if (currentState === 'default') {
        await setDayOverride(day, { type: 'custom', time: defaultTime });
        setEditingDay(day);
      } else if (currentState === 'custom') {
        setEditingDay(null);
        await setDayOverride(day, { type: 'off' });
      } else {
        setEditingDay(null);
        await removeDayOverride(day);
      }
    },
    [target, defaultTime, setDayOverride, removeDayOverride],
  );

  const handleTimeChange = useCallback(
    async (day: DayOfWeek, time: AlarmTime) => {
      await setDayOverride(day, { type: 'custom', time });
    },
    [setDayOverride],
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
          const resolvedTime = resolveTimeForDate({ ...target, nextOverride: null }, testDate);
          const hasOverride = state !== 'default';
          const isEditing = editingDay === day && state === 'custom';
          const override = target.dayOverrides[day];
          const customTime =
            override !== undefined && override.type === 'custom' ? override.time : defaultTime;

          return (
            <View key={day}>
              <Pressable
                style={[styles.dayRow, hasOverride && styles.dayRowOverride]}
                onPress={() => handleDayPress(day)}
              >
                <View style={styles.dayInfo}>
                  <Text style={styles.dayName}>{getDayLabel(day, t as TranslateFn)}</Text>
                  <Text style={[styles.dayState, hasOverride && styles.dayStateOverride]}>
                    {state === 'default'
                      ? t('schedule.useDefault')
                      : state === 'custom'
                        ? t('schedule.customTime')
                        : t('schedule.off')}
                  </Text>
                </View>
                <Text style={[styles.dayTime, state === 'off' && styles.dayTimeOff]}>
                  {resolvedTime !== null ? formatTime(resolvedTime) : t('schedule.off')}
                </Text>
              </Pressable>
              {isEditing && (
                <View style={styles.pickerContainer}>
                  <InlineTimePicker
                    time={customTime}
                    onChange={(time) => handleTimeChange(day, time)}
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

const pickerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  column: {
    alignItems: 'center',
  },
  button: {
    padding: spacing.sm,
  },
  buttonText: {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
  },
  display: {
    fontSize: fontSize.xxl,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    minWidth: 52,
    textAlign: 'center',
  },
  separator: {
    fontSize: fontSize.xxl,
    fontWeight: '600',
    color: colors.text,
    marginHorizontal: spacing.sm,
  },
});

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
    backgroundColor: colors.surfaceLight,
    borderBottomLeftRadius: borderRadius.md,
    borderBottomRightRadius: borderRadius.md,
    marginTop: -spacing.sm,
  },
});
