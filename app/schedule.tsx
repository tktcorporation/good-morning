import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, commonStyles, fontSize, spacing } from '../src/constants/theme';
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

/**
 * 各曜日の状態（default / custom / off）を明示的に切り替える3択セグメント。
 *
 * 以前は行全体タップで default → custom → off → default と循環させていたが、
 * ピッカーを閉じたいだけのタップが 'off' に化けたり（アラームの意図せぬ無効化）、
 * off から戻すと customTime が defaultTime にリセットされたりする事故があった。
 * セグメントを直接選択する方式にすることで、選択と状態が1:1に対応し曖昧さがなくなる。
 */
function DaySegmentedControl({
  state,
  onSelect,
}: {
  readonly state: DayState;
  readonly onSelect: (state: DayState) => void;
}) {
  const { t } = useTranslation('common');
  const segments: ReadonlyArray<{ readonly key: DayState; readonly label: string }> = [
    { key: 'default', label: t('schedule.useDefault') },
    { key: 'custom', label: t('schedule.customTime') },
    { key: 'off', label: t('schedule.off') },
  ];

  return (
    <View style={styles.segmentedControl}>
      {segments.map((segment) => {
        const isActive = segment.key === state;
        return (
          <Pressable
            key={segment.key}
            style={[styles.segment, isActive && styles.segmentActive]}
            onPress={() => onSelect(segment.key)}
          >
            <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
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

  const handleDaySegmentSelect = useCallback(
    async (day: DayOfWeek, nextState: DayState) => {
      if (target === null) return;
      const currentState = getDayState(day, target.dayOverrides);

      if (currentState === nextState) {
        // 既にその状態のセグメントを選び直した場合、custom だけはピッカーの
        // 開閉トグルとして扱う（customTime を defaultTime に巻き戻さないため）。
        if (nextState === 'custom') {
          setEditingDay((prev) => (prev === day ? null : day));
        }
        return;
      }

      setEditingDay(nextState === 'custom' ? day : null);
      if (nextState === 'default') {
        await removeDayOverride(day);
      } else if (nextState === 'off') {
        await setDayOverride(day, { type: 'off' });
      } else {
        await setDayOverride(day, { type: 'custom', time: defaultTime });
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
      <View style={[commonStyles.card, styles.defaultTimeSection]}>
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
              <View
                style={[commonStyles.card, styles.dayRow, hasOverride && styles.dayRowOverride]}
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
              </View>
              <DaySegmentedControl
                state={state}
                onSelect={(nextState) => handleDaySegmentSelect(day, nextState)}
              />
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
    borderRadius: borderRadius.md,
    marginTop: spacing.xs,
  },
  segmentedControl: {
    flexDirection: 'row',
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  segmentActive: {
    borderBottomColor: colors.primary,
  },
  segmentText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
  },
  segmentTextActive: {
    color: colors.primary,
  },
});
