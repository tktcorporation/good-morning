import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, commonStyles, fontSize, spacing } from '@/constants/theme';
import {
  formatSleepDuration,
  MAX_SLEEP_MINUTES,
  MIN_SLEEP_MINUTES,
  SLEEP_STEP_MINUTES,
} from '@/utils/sleep';

/** FlatList の各行の高さ。getItemLayout で固定高さを指定してスクロール性能を最適化する。 */
const ITEM_HEIGHT = 48;

/**
 * 5h〜10h を 30分刻みで列挙した選択肢リスト（11項目）。
 * FlatList の data として使用。
 */
const SLEEP_OPTIONS: number[] = Array.from(
  { length: (MAX_SLEEP_MINUTES - MIN_SLEEP_MINUTES) / SLEEP_STEP_MINUTES + 1 },
  (_, i) => MIN_SLEEP_MINUTES + i * SLEEP_STEP_MINUTES,
);

interface SleepDurationPickerModalProps {
  readonly visible: boolean;
  readonly currentValue: number | null;
  readonly onSave: (value: number | null) => void;
  readonly onClose: () => void;
}

/**
 * 目標睡眠時間を選択するボトムシート風モーダル。
 *
 * 背景: 設定画面から就寝時刻ピッカーを廃止し、代わりに睡眠時間（分）を
 * 直接選択する方式に変更。SleepDurationCard から開かれる。
 * DayBoundaryPicker と同じ overlay/sheet/buttonRow パターンを踏襲。
 *
 * 構成:
 * - FlatList で 5h〜10h（30分刻み、11項目）を表示
 * - 選択中の項目をハイライト
 * - Clear / Cancel / Save ボタン
 *
 * 使用箇所: src/components/SleepDurationCard.tsx
 */
export function SleepDurationPickerModal({
  visible,
  currentValue,
  onSave,
  onClose,
}: SleepDurationPickerModalProps) {
  const { t } = useTranslation('dashboard');
  const { t: tCommon } = useTranslation('common');
  const [selectedValue, setSelectedValue] = useState<number>(currentValue ?? 420);
  const flatListRef = useRef<FlatList<number>>(null);

  /**
   * モーダル表示時に現在の選択値へ自動スクロールする。
   * currentValue が変わるたびに selectedValue をリセットし、
   * FlatList を該当行付近にスクロールする。
   */
  const handleShow = useCallback(() => {
    const value = currentValue ?? 420;
    setSelectedValue(value);
    setTimeout(() => {
      const index = SLEEP_OPTIONS.indexOf(value);
      if (index >= 0) {
        const scrollIndex = Math.max(0, index - 2);
        flatListRef.current?.scrollToIndex({ index: scrollIndex, animated: false });
      }
    }, 0);
  }, [currentValue]);

  const handleSave = useCallback(() => {
    onSave(selectedValue);
  }, [selectedValue, onSave]);

  const handleClear = useCallback(() => {
    onSave(null);
  }, [onSave]);

  /** FlatList の getItemLayout -- 固定高さなので計算で位置を求められる */
  const getItemLayout = useCallback(
    (_data: ArrayLike<number> | null | undefined, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    [],
  );

  const renderItem = useCallback(
    ({ item: minutes }: { item: number }) => {
      const isSelected = minutes === selectedValue;
      return (
        <Pressable
          style={[
            commonStyles.bottomSheetItem,
            { height: ITEM_HEIGHT },
            isSelected && commonStyles.bottomSheetItemSelected,
          ]}
          onPress={() => setSelectedValue(minutes)}
        >
          <Text
            style={[
              commonStyles.bottomSheetItemText,
              isSelected && commonStyles.bottomSheetItemTextSelected,
            ]}
          >
            {formatSleepDuration(minutes)}
          </Text>
          {isSelected && <Text style={commonStyles.bottomSheetCheckmark}>{'✓'}</Text>}
        </Pressable>
      );
    },
    [selectedValue],
  );

  const keyExtractor = useCallback((minutes: number) => `sleep-${minutes}`, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onShow={handleShow}
      onRequestClose={onClose}
    >
      <Pressable style={commonStyles.bottomSheetOverlay} onPress={onClose}>
        {/* 内側のシートをタップしてもモーダルが閉じないようにイベント伝播を止める */}
        <Pressable style={commonStyles.bottomSheetContainer} onPress={(e) => e.stopPropagation()}>
          <Text style={[commonStyles.bottomSheetTitle, { marginBottom: spacing.md }]}>
            {t('sleep.title')}
          </Text>

          <FlatList
            ref={flatListRef}
            data={SLEEP_OPTIONS}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            getItemLayout={getItemLayout}
            style={commonStyles.bottomSheetList}
          />

          {/* Action Buttons -- DayBoundaryPicker と同じ buttonRow パターン + Clear ボタン */}
          <View style={styles.buttonRow}>
            <Pressable style={commonStyles.bottomSheetTextButton} onPress={handleClear}>
              <Text style={styles.clearButtonLabel}>{t('sleep.clear')}</Text>
            </Pressable>
            <View style={styles.buttonRowRight}>
              <Pressable style={commonStyles.bottomSheetTextButton} onPress={onClose}>
                <Text style={commonStyles.bottomSheetTextButtonLabel}>{tCommon('cancel')}</Text>
              </Pressable>
              <Pressable style={commonStyles.bottomSheetPrimaryButton} onPress={handleSave}>
                <Text style={commonStyles.bottomSheetPrimaryButtonLabel}>{tCommon('save')}</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Buttons -- Clear を左寄せ、Cancel/Save を右寄せにするレイアウト
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  buttonRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  clearButtonLabel: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
