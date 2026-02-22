import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../../constants/theme';
import type { AlarmTime } from '../../types/alarm';
import { StepButton } from './StepButton';

interface TimeStepProps {
  readonly onNext: () => void;
  readonly onBack: () => void;
  readonly time: AlarmTime;
  readonly setTime: (time: AlarmTime) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const ITEM_HEIGHT = 48;

export function TimeStep({ onNext, onBack, time, setTime }: TimeStepProps) {
  const { t } = useTranslation('onboarding');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('time.title')}</Text>
        <Text style={styles.subtitle}>{t('time.subtitle')}</Text>
      </View>

      <View style={styles.pickerContainer}>
        <ScrollView
          style={styles.picker}
          contentContainerStyle={styles.pickerContent}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          contentOffset={{ x: 0, y: time.hour * ITEM_HEIGHT }}
          onMomentumScrollEnd={(e) => {
            const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
            const clampedIndex = Math.max(0, Math.min(index, HOURS.length - 1));
            const hour = HOURS[clampedIndex];
            if (hour !== undefined) {
              setTime({ ...time, hour });
            }
          }}
        >
          {HOURS.map((h) => (
            <View key={h} style={styles.pickerItem}>
              <Text style={[styles.pickerText, h === time.hour && styles.pickerTextSelected]}>
                {h.toString().padStart(2, '0')}
              </Text>
            </View>
          ))}
        </ScrollView>

        <Text style={styles.colon}>{':'}</Text>

        <ScrollView
          style={styles.picker}
          contentContainerStyle={styles.pickerContent}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          contentOffset={{ x: 0, y: (time.minute / 5) * ITEM_HEIGHT }}
          onMomentumScrollEnd={(e) => {
            const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
            const clampedIndex = Math.max(0, Math.min(index, MINUTES.length - 1));
            const minute = MINUTES[clampedIndex];
            if (minute !== undefined) {
              setTime({ ...time, minute });
            }
          }}
        >
          {MINUTES.map((m) => (
            <View key={m} style={styles.pickerItem}>
              <Text style={[styles.pickerText, m === time.minute && styles.pickerTextSelected]}>
                {m.toString().padStart(2, '0')}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <Text style={styles.selectedTime}>
        {time.hour.toString().padStart(2, '0')}
        {':'}
        {time.minute.toString().padStart(2, '0')}
      </Text>

      <View style={styles.buttons}>
        <StepButton label={t('back')} onPress={onBack} variant="secondary" flex={1} />
        <StepButton label={t('next')} onPress={onNext} variant="primary" flex={1} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  pickerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: ITEM_HEIGHT * 3,
    marginVertical: spacing.lg,
  },
  picker: {
    width: 80,
    height: ITEM_HEIGHT * 3,
  },
  pickerContent: {
    paddingVertical: ITEM_HEIGHT,
  },
  pickerItem: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerText: {
    fontSize: fontSize.xxl,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  pickerTextSelected: {
    color: colors.text,
    fontWeight: '600',
  },
  colon: {
    fontSize: fontSize.xxl,
    color: colors.text,
    fontWeight: '600',
    marginHorizontal: spacing.sm,
  },
  selectedTime: {
    fontSize: fontSize.time,
    fontWeight: '200',
    color: colors.primary,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    marginBottom: spacing.xl,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: 'auto',
    paddingHorizontal: spacing.md,
  },
});
