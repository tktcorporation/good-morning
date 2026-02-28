import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '@/constants/theme';
import type { AlarmTime } from '@/types/alarm';
import { formatTime } from '@/types/alarm';
import { calculateBedtime, formatSleepDuration } from '@/utils/sleep';
import { SleepDurationPickerModal } from './SleepDurationPickerModal';

interface SleepDurationCardProps {
  readonly alarmTime: AlarmTime | null;
  readonly targetSleepMinutes: number | null;
  readonly onSleepMinutesChange: (minutes: number | null) => void;
}

/**
 * ダッシュボードに表示する睡眠情報カード。
 *
 * 背景: 設定画面にあった就寝時刻ピッカーを廃止し、メイン画面から
 * 目標睡眠時間を直感的に確認・変更できるようにした。
 * アラーム時刻の直下に配置し、就寝目標時刻を逆算表示する。
 *
 * 状態:
 * - targetSleepMinutes が null: 「目標睡眠時間を設定」リンクを表示
 * - targetSleepMinutes が設定済み: "7h -> 23:00 就寝" 形式で表示
 * タップでSleepDurationPickerModal を開く。
 *
 * 使用箇所: app/(tabs)/index.tsx — Target Time Display の直下
 */
export function SleepDurationCard({
  alarmTime,
  targetSleepMinutes,
  onSleepMinutesChange,
}: SleepDurationCardProps) {
  const { t } = useTranslation('dashboard');
  const [pickerVisible, setPickerVisible] = useState(false);

  const bedtime = useMemo(
    () =>
      alarmTime !== null && targetSleepMinutes !== null
        ? calculateBedtime(alarmTime, targetSleepMinutes)
        : null,
    [alarmTime, targetSleepMinutes],
  );

  const handleOpen = useCallback(() => {
    setPickerVisible(true);
  }, []);

  const handleClose = useCallback(() => {
    setPickerVisible(false);
  }, []);

  const handleSave = useCallback(
    (value: number | null) => {
      onSleepMinutesChange(value);
      setPickerVisible(false);
    },
    [onSleepMinutesChange],
  );

  const hasValue = targetSleepMinutes !== null && bedtime !== null;

  return (
    <View style={styles.container}>
      <Pressable style={styles.card} onPress={handleOpen}>
        {hasValue ? (
          <Text style={styles.valueText}>
            {formatSleepDuration(targetSleepMinutes)}
            {'  '}
            {formatTime(bedtime)} {t('sleep.bedtime')}
          </Text>
        ) : (
          <Text style={styles.setupText}>{t('sleep.setup')}</Text>
        )}
      </Pressable>

      <SleepDurationPickerModal
        visible={pickerVisible}
        currentValue={targetSleepMinutes}
        onSave={handleSave}
        onClose={handleClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  /** 設定済み時の表示テキスト。textSecondary でアラーム時刻より控えめにする */
  valueText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  /** 未設定時のリンク風テキスト。textMuted で更に控えめに */
  setupText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
});
