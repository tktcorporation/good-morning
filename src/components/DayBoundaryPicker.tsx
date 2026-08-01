import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, commonStyles, fontSize, spacing } from '@/constants/theme';

/** FlatList の各行の高さ。getItemLayout で固定高さを指定してスクロール性能を最適化する。 */
const ITEM_HEIGHT = 48;

/** 0〜23 の24時間リスト。FlatList の data として使用。 */
const HOURS: number[] = Array.from({ length: 24 }, (_, i) => i);

interface DayBoundaryPickerProps {
  value: number;
  onValueChange: (value: number) => void;
}

/**
 * 日付変更ラインの時刻を選択するピッカー。
 *
 * 背景: 以前は DayBoundarySlider（0〜6時のスライダー）だったが、
 * 範囲が狭く直感的でないため、0〜23時をリスト選択できるボトムシート風モーダルに変更。
 * overlay/sheet/buttonRow パターンのボトムシート風モーダル。
 *
 * 構成:
 * 1. トリガー行 — 設定画面に表示。現在値とシェブロンを表示し、タップでモーダルを開く。
 * 2. モーダル — FlatList で24項目を表示。選択中の項目をハイライト。キャンセル/保存ボタン。
 *
 * 使用箇所: app/(tabs)/settings.tsx の Day Boundary セクション
 */
export function DayBoundaryPicker({ value, onValueChange }: DayBoundaryPickerProps) {
  const { t } = useTranslation('common');
  const [visible, setVisible] = useState(false);
  const [selectedHour, setSelectedHour] = useState(value);
  const flatListRef = useRef<FlatList<number>>(null);

  const handleOpen = useCallback(() => {
    setSelectedHour(value);
    setVisible(true);
  }, [value]);

  const handleClose = useCallback(() => {
    setVisible(false);
  }, []);

  const handleSave = useCallback(() => {
    onValueChange(selectedHour);
    setVisible(false);
  }, [selectedHour, onValueChange]);

  /**
   * モーダル表示時に現在の選択値付近へ自動スクロールする。
   * FlatList の getItemLayout で固定高さを指定済みなので scrollToIndex が高速に動作する。
   * 選択値が画面中央あたりに来るように、2行分上にオフセットしてスクロールする。
   */
  const handleShow = useCallback(() => {
    // setTimeout(0) で FlatList のレイアウト完了を待つ。
    // onShow コールバック時点ではまだ FlatList がマウントされていない場合があるため。
    setTimeout(() => {
      const scrollIndex = Math.max(0, selectedHour - 2);
      flatListRef.current?.scrollToIndex({ index: scrollIndex, animated: false });
    }, 0);
  }, [selectedHour]);

  /** FlatList の getItemLayout — 固定高さなので計算で位置を求められる */
  const getItemLayout = useCallback(
    (_data: ArrayLike<number> | null | undefined, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    [],
  );

  const renderItem = useCallback(
    ({ item: hour }: { item: number }) => {
      const isSelected = hour === selectedHour;
      return (
        <Pressable
          style={[
            commonStyles.bottomSheetItem,
            styles.item,
            isSelected && commonStyles.bottomSheetItemSelected,
          ]}
          onPress={() => setSelectedHour(hour)}
        >
          <Text
            style={[
              commonStyles.bottomSheetItemText,
              isSelected && commonStyles.bottomSheetItemTextSelected,
            ]}
          >
            {t('settings.dayBoundaryHour', { hour })}
          </Text>
          {isSelected && <Text style={commonStyles.bottomSheetCheckmark}>{'✓'}</Text>}
        </Pressable>
      );
    },
    [selectedHour, t],
  );

  const keyExtractor = useCallback((hour: number) => `hour-${hour}`, []);

  return (
    <>
      {/* トリガー行 — タップでモーダルを開く */}
      <Pressable style={styles.trigger} onPress={handleOpen}>
        <Text style={styles.triggerText}>{t('settings.dayBoundaryHour', { hour: value })}</Text>
        <Text style={styles.chevron}>{'>'}</Text>
      </Pressable>

      {/* ボトムシート風モーダル */}
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onShow={handleShow}
        onRequestClose={handleClose}
      >
        <Pressable style={commonStyles.bottomSheetOverlay} onPress={handleClose}>
          {/* 内側のシートをタップしてもモーダルが閉じないようにイベント伝播を止める */}
          <Pressable style={commonStyles.bottomSheetContainer} onPress={(e) => e.stopPropagation()}>
            <Text style={[commonStyles.bottomSheetTitle, styles.title]}>
              {t('settings.dayBoundary')}
            </Text>
            <Text style={styles.description}>{t('settings.dayBoundaryDescription')}</Text>

            <FlatList
              ref={flatListRef}
              data={HOURS}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              getItemLayout={getItemLayout}
              style={commonStyles.bottomSheetList}
            />

            {/* Action Buttons */}
            <View style={styles.buttonRow}>
              <Pressable style={commonStyles.bottomSheetTextButton} onPress={handleClose}>
                <Text style={commonStyles.bottomSheetTextButtonLabel}>{t('cancel')}</Text>
              </Pressable>
              <Pressable style={commonStyles.bottomSheetPrimaryButton} onPress={handleSave}>
                <Text style={commonStyles.bottomSheetPrimaryButtonLabel}>{t('save')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Trigger row — settings.tsx の row スタイルと同じパターン
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  triggerText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  chevron: {
    fontSize: fontSize.lg,
    color: colors.textMuted,
  },

  title: {
    marginBottom: spacing.xs,
  },
  item: {
    height: ITEM_HEIGHT,
  },

  description: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.md,
    lineHeight: 22,
  },

  // Buttons
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
