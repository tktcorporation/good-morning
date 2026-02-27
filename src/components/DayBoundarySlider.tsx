import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '@/constants/theme';

const MIN_VALUE = 0;
const MAX_VALUE = 6;
const STEP_COUNT = MAX_VALUE - MIN_VALUE;

/** サムのサイズ。タッチターゲットとしても十分な 28px */
const THUMB_SIZE = 28;

/** スナップ位置を示すドットのサイズ */
const DOT_SIZE = 8;

/** トラックの高さ */
const TRACK_HEIGHT = 4;

interface DayBoundarySliderProps {
  value: number;
  onValueChange: (value: number) => void;
}

/**
 * 日付変更ラインの時刻を選択する離散値スライダー。
 *
 * 背景: 設定画面で0:00〜6:00を選ぶUIが7つのボタン横並びだったが、
 * ユーザーから「セレクトっぽくて違和感がある」とのフィードバックがあり、
 * スライダーUIに変更。PanResponder を使い、7段階にスナップする。
 *
 * 使用箇所: app/(tabs)/settings.tsx の Day Boundary セクション
 */
export function DayBoundarySlider({ value, onValueChange }: DayBoundarySliderProps) {
  const { t } = useTranslation('common');
  const trackWidthRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const clampAndSnap = useCallback(
    (locationX: number): number => {
      const trackWidth = trackWidthRef.current;
      if (trackWidth === 0) return value;
      const ratio = Math.max(0, Math.min(1, locationX / trackWidth));
      return Math.round(ratio * STEP_COUNT) + MIN_VALUE;
    },
    [value],
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        setIsDragging(true);
        const locationX = evt.nativeEvent.locationX;
        const snapped = clampAndSnap(locationX);
        onValueChange(snapped);
      },
      onPanResponderMove: (evt) => {
        const locationX = evt.nativeEvent.locationX;
        const snapped = clampAndSnap(locationX);
        onValueChange(snapped);
      },
      onPanResponderRelease: (evt) => {
        setIsDragging(false);
        const locationX = evt.nativeEvent.locationX;
        const snapped = clampAndSnap(locationX);
        onValueChange(snapped);
      },
      onPanResponderTerminate: () => {
        setIsDragging(false);
      },
    }),
  ).current;

  const handleTrackLayout = useCallback((event: LayoutChangeEvent) => {
    trackWidthRef.current = event.nativeEvent.layout.width;
  }, []);

  // サムの位置を 0〜1 の割合で計算
  const thumbRatio = (value - MIN_VALUE) / STEP_COUNT;

  return (
    <View style={styles.container}>
      {/* 現在値の大きな表示 */}
      <Text style={[styles.currentValue, isDragging && styles.currentValueDragging]}>
        {t('settings.dayBoundaryHour', { hour: value })}
      </Text>

      {/* トラック領域（タッチ受付範囲を広くするためパディングを含む） */}
      <View style={styles.trackTouchArea} {...panResponder.panHandlers}>
        <View style={styles.track} onLayout={handleTrackLayout}>
          {/* アクティブ部分のトラック */}
          <View style={[styles.trackActive, { width: `${thumbRatio * 100}%` }]} />

          {/* スナップ位置のドット（固定7個、順序不変なので hour 値をキーに使用） */}
          {Array.from({ length: STEP_COUNT + 1 }, (_, i) => {
            const hour = i + MIN_VALUE;
            const dotRatio = i / STEP_COUNT;
            const isActive = i <= value - MIN_VALUE;
            return (
              <View
                key={`dot-${hour}`}
                style={[
                  styles.dot,
                  isActive && styles.dotActive,
                  {
                    left: `${dotRatio * 100}%`,
                    marginLeft: -DOT_SIZE / 2,
                  },
                ]}
              />
            );
          })}

          {/* サム（つまみ） */}
          <View
            style={[
              styles.thumb,
              {
                left: `${thumbRatio * 100}%`,
                marginLeft: -THUMB_SIZE / 2,
              },
              isDragging && styles.thumbDragging,
            ]}
          />
        </View>
      </View>

      {/* 両端のラベル */}
      <View style={styles.labelRow}>
        <Text style={styles.label}>{t('settings.dayBoundaryHour', { hour: MIN_VALUE })}</Text>
        <Text style={styles.label}>{t('settings.dayBoundaryHour', { hour: MAX_VALUE })}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.sm,
  },
  currentValue: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  currentValueDragging: {
    color: colors.primary,
  },
  /** タッチ領域を広げるためにパディングを持たせる */
  trackTouchArea: {
    paddingVertical: spacing.md,
    paddingHorizontal: THUMB_SIZE / 2,
  },
  track: {
    height: TRACK_HEIGHT,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    position: 'relative',
    justifyContent: 'center',
  },
  trackActive: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
  },
  dot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: colors.textMuted,
    top: (TRACK_HEIGHT - DOT_SIZE) / 2,
  },
  dotActive: {
    backgroundColor: colors.primary,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: colors.primary,
    top: (TRACK_HEIGHT - THUMB_SIZE) / 2,
    // 影でサムを浮かせる
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  thumbDragging: {
    transform: [{ scale: 1.15 }],
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: THUMB_SIZE / 2,
  },
  label: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
});
