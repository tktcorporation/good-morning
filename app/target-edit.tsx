import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../src/constants/theme';
import { useSettingsStore } from '../src/stores/settings-store';
import { useWakeTargetStore } from '../src/stores/wake-target-store';
import type { AlarmTime } from '../src/types/alarm';
import { resolveOverrideEditDay, resolveTimeForDate } from '../src/types/wake-target';

type EditMode = 'tomorrowOnly' | 'changeDefault';

export default function TargetEditScreen() {
  const { t } = useTranslation('dashboard');
  const router = useRouter();

  const target = useWakeTargetStore((s) => s.target);
  const setNextOverride = useWakeTargetStore((s) => s.setNextOverride);
  const updateDefaultTime = useWakeTargetStore((s) => s.updateDefaultTime);
  const dayBoundaryHour = useSettingsStore((s) => s.dayBoundaryHour);

  const currentResolvedTime = useMemo(() => {
    if (target === null) return { hour: 7, minute: 0 };
    // setNextOverride の対象日（computeOverrideTargetDate）と同じ基準で
    // 「次に迎える朝」を決める。dayBoundaryHour がアラーム時刻より後だと、
    // 境界通過前は暦日ベースの +1日だけでは今日に戻ってしまい、その日の
    // 時刻が既に過ぎていても気づけない（保存時はさらに1日先送りされ、
    // 表示される dayOverrides の曜日と保存先の曜日がズレる）
    const tomorrow = resolveOverrideEditDay(target, dayBoundaryHour);
    return resolveTimeForDate(target, tomorrow) ?? { hour: 7, minute: 0 };
  }, [target, dayBoundaryHour]);

  const [hour, setHour] = useState(currentResolvedTime.hour);
  const [minute, setMinute] = useState(currentResolvedTime.minute);
  const [mode, setMode] = useState<EditMode>('tomorrowOnly');

  const adjustHour = useCallback((delta: number) => {
    setHour((prev) => (prev + delta + 24) % 24);
  }, []);

  const adjustMinute = useCallback((delta: number) => {
    setMinute((prev) => (prev + delta * 5 + 60) % 60);
  }, []);

  const handleSave = useCallback(async () => {
    const time: AlarmTime = { hour, minute };
    if (mode === 'tomorrowOnly') {
      await setNextOverride(time);
    } else {
      await updateDefaultTime(time);
    }
    router.back();
  }, [hour, minute, mode, setNextOverride, updateDefaultTime, router]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('targetEdit.title')}</Text>

      {/* Time Picker */}
      <View style={styles.pickerContainer}>
        <View style={styles.pickerColumn}>
          <Pressable style={styles.pickerButton} onPress={() => adjustHour(1)}>
            <Text style={styles.pickerArrow}>{'▲'}</Text>
          </Pressable>
          <Text style={styles.pickerValue}>{hour.toString().padStart(2, '0')}</Text>
          <Pressable style={styles.pickerButton} onPress={() => adjustHour(-1)}>
            <Text style={styles.pickerArrow}>{'▼'}</Text>
          </Pressable>
        </View>

        <Text style={styles.pickerSeparator}>{':'}</Text>

        <View style={styles.pickerColumn}>
          <Pressable style={styles.pickerButton} onPress={() => adjustMinute(1)}>
            <Text style={styles.pickerArrow}>{'▲'}</Text>
          </Pressable>
          <Text style={styles.pickerValue}>{minute.toString().padStart(2, '0')}</Text>
          <Pressable style={styles.pickerButton} onPress={() => adjustMinute(-1)}>
            <Text style={styles.pickerArrow}>{'▼'}</Text>
          </Pressable>
        </View>
      </View>

      {/* Mode Selection */}
      <View style={styles.modeSection}>
        <Pressable style={styles.modeRow} onPress={() => setMode('tomorrowOnly')}>
          <View style={[styles.radio, mode === 'tomorrowOnly' && styles.radioSelected]}>
            {mode === 'tomorrowOnly' && <View style={styles.radioInner} />}
          </View>
          <Text style={styles.modeLabel}>{t('targetEdit.tomorrowOnly')}</Text>
        </Pressable>

        <Pressable style={styles.modeRow} onPress={() => setMode('changeDefault')}>
          <View style={[styles.radio, mode === 'changeDefault' && styles.radioSelected]}>
            {mode === 'changeDefault' && <View style={styles.radioInner} />}
          </View>
          <Text style={styles.modeLabel}>{t('targetEdit.changeDefault')}</Text>
        </Pressable>
      </View>

      {/* Save Button */}
      <Pressable style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>{t('targetEdit.save')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.xl,
  },

  // Time Picker
  pickerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  pickerColumn: {
    alignItems: 'center',
  },
  pickerButton: {
    padding: spacing.md,
  },
  pickerArrow: {
    fontSize: fontSize.xl,
    color: colors.textSecondary,
  },
  pickerValue: {
    fontSize: fontSize.time,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    minWidth: 80,
    textAlign: 'center',
  },
  pickerSeparator: {
    fontSize: fontSize.time,
    fontWeight: '700',
    color: colors.text,
    marginHorizontal: spacing.sm,
  },

  // Mode Selection
  modeSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  modeLabel: {
    color: colors.text,
    fontSize: fontSize.md,
  },

  // Save Button
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  saveButtonText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
});
