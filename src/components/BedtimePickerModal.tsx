import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '@/constants/theme';

interface BedtimePickerModalProps {
  visible: boolean;
  currentValue: { hour: number; minute: number } | null;
  onSave: (value: { hour: number; minute: number } | null) => void;
  onClose: () => void;
}

/** 就寝時間帯（20〜2時）を循環する。24時間の全範囲ではなく就寝に適した範囲に制限。 */
const VALID_HOURS: number[] = [20, 21, 22, 23, 0, 1, 2];

/** 15分刻みで循環する。細かすぎず粗すぎない就寝時刻設定のため。 */
const VALID_MINUTES: number[] = [0, 15, 30, 45];

/**
 * 就寝目標時刻を選択するためのボトムシート風モーダル。
 *
 * 背景: 以前はプリセット値をタップで循環するUIだったが、
 * ユーザーから「タップで切り替わるのが不思議」というフィードバックがあったため、
 * 上下ボタン式の時間ピッカーに変更。target-edit.tsx の時刻ピッカーと同じUIパターン。
 *
 * 時の範囲: 20〜2（就寝時間帯に合わせて循環）
 * 分の範囲: 0, 15, 30, 45（4段階で循環）
 */
export function BedtimePickerModal({
  visible,
  currentValue,
  onSave,
  onClose,
}: BedtimePickerModalProps) {
  const { t } = useTranslation('common');

  const [hour, setHour] = useState(() => currentValue?.hour ?? 23);
  const [minute, setMinute] = useState(() => currentValue?.minute ?? 0);

  // モーダルが開くたびに currentValue で再初期化する。
  // useState の初期値はマウント時しか評価されないため、
  // visible が true に変わるタイミングで同期する必要がある。
  const handleShow = useCallback(() => {
    setHour(currentValue?.hour ?? 23);
    setMinute(currentValue?.minute ?? 0);
  }, [currentValue]);

  const adjustHour = useCallback((delta: number) => {
    setHour((prev) => {
      const currentIndex = VALID_HOURS.indexOf(prev);
      // 範囲外の値が来た場合は先頭に戻す
      const idx = currentIndex === -1 ? 0 : currentIndex;
      const nextIndex = (idx + delta + VALID_HOURS.length) % VALID_HOURS.length;
      return VALID_HOURS[nextIndex] ?? 23;
    });
  }, []);

  const adjustMinute = useCallback((delta: number) => {
    setMinute((prev) => {
      const currentIndex = VALID_MINUTES.indexOf(prev);
      const idx = currentIndex === -1 ? 0 : currentIndex;
      const nextIndex = (idx + delta + VALID_MINUTES.length) % VALID_MINUTES.length;
      return VALID_MINUTES[nextIndex] ?? 0;
    });
  }, []);

  const handleSave = useCallback(() => {
    onSave({ hour, minute });
  }, [hour, minute, onSave]);

  const handleClear = useCallback(() => {
    onSave(null);
  }, [onSave]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onShow={handleShow}
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        {/* 内側のカードをタップしてもモーダルが閉じないようにイベント伝播を止める */}
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{t('settings.bedtimeTarget')}</Text>

          {/* Time Picker - target-edit.tsx と同じ上下ボタンパターン */}
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

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <Pressable style={styles.textButton} onPress={handleClear}>
              <Text style={styles.textButtonLabel}>{t('settings.bedtimeClear')}</Text>
            </Pressable>
            <Pressable style={styles.textButton} onPress={onClose}>
              <Text style={styles.textButtonLabel}>{t('settings.bedtimeCancel')}</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={handleSave}>
              <Text style={styles.primaryButtonLabel}>{t('settings.bedtimeSave')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.lg,
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

  // Buttons
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
  },
  textButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  textButtonLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  primaryButtonLabel: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
