import { Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, fontSize } from '../constants/theme';
import { DAY_LABELS, type DayOfWeek } from '../types/alarm';

interface DaySelectorProps {
  readonly selectedDays: readonly DayOfWeek[];
  readonly onToggle: (day: DayOfWeek) => void;
}

const ALL_DAYS: readonly DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

export function DaySelector({ selectedDays, onToggle }: DaySelectorProps) {
  return (
    <View style={styles.container}>
      {ALL_DAYS.map((day) => {
        const isSelected = selectedDays.includes(day);
        return (
          <Pressable
            key={day}
            style={[styles.dayButton, isSelected && styles.dayButtonSelected]}
            onPress={() => onToggle(day)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={DAY_LABELS[day]}
          >
            <Text style={[styles.dayText, isSelected && styles.dayTextSelected]}>
              {DAY_LABELS[day]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  dayTextSelected: {
    color: colors.text,
  },
});
