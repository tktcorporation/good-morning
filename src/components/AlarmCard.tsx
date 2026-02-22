import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../constants/theme';
import type { Alarm, TranslateFn } from '../types/alarm';
import { formatRepeatDays, formatTime } from '../types/alarm';

interface AlarmCardProps {
  readonly alarm: Alarm;
  readonly onPress: (id: string) => void;
  readonly onToggle: (id: string) => void;
}

export function AlarmCard({ alarm, onPress, onToggle }: AlarmCardProps) {
  const { t } = useTranslation('common');
  const { t: tAlarm } = useTranslation('alarm');
  const textColor = alarm.enabled ? colors.text : colors.textMuted;
  const todoCount = alarm.todos.length;

  return (
    <Pressable
      style={styles.container}
      onPress={() => onPress(alarm.id)}
      accessibilityRole="button"
      accessibilityLabel={tAlarm('accessibilityAlarmAt', { time: formatTime(alarm.time), status: alarm.enabled ? tAlarm('accessibilityEnabled') : tAlarm('accessibilityDisabled') })}
    >
      <View style={styles.content}>
        <Text style={[styles.time, { color: textColor }]}>{formatTime(alarm.time)}</Text>
        <View style={styles.details}>
          {alarm.label !== '' && (
            <Text style={[styles.label, { color: textColor }]}>{alarm.label}</Text>
          )}
          <Text style={styles.repeat}>
            {formatRepeatDays(alarm.repeatDays, t as TranslateFn)}
          </Text>
          {todoCount > 0 && (
            <Text style={styles.todoCount}>{tAlarm('tasksToComplete', { count: todoCount })}</Text>
          )}
        </View>
      </View>
      <Switch
        value={alarm.enabled}
        onValueChange={() => onToggle(alarm.id)}
        trackColor={{ false: colors.disabled, true: colors.primary }}
        thumbColor={colors.text}
        accessibilityLabel={tAlarm('accessibilityToggleAlarm', { time: formatTime(alarm.time) })}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  content: {
    flex: 1,
    marginRight: spacing.md,
  },
  time: {
    fontSize: fontSize.xxl,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
  details: {
    marginTop: spacing.xs,
  },
  label: {
    fontSize: fontSize.md,
    marginBottom: spacing.xs,
  },
  repeat: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  todoCount: {
    fontSize: fontSize.xs,
    color: colors.primary,
    marginTop: spacing.xs,
  },
});
