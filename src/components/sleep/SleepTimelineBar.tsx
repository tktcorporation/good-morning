import { useCallback, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { colors } from '../../constants/theme';
import type { AlarmTime } from '../../types/alarm';

const TIMELINE_START_HOUR = 20;
const TIMELINE_HOURS = 16; // 20:00 -> next day 12:00
const PADDING_X = 16;
const HOUR_LABELS = [20, 22, 0, 2, 4, 6, 8, 10, 12];

interface SleepTimelineBarProps {
  readonly bedtime: Date | null;
  readonly wakeTime: Date | null;
  readonly targetTime: AlarmTime | null;
  readonly dismissedAt: Date | null;
  readonly compact?: boolean;
}

function timeToFraction(date: Date): number {
  let hours = date.getHours() + date.getMinutes() / 60;
  if (hours < TIMELINE_START_HOUR) {
    hours += 24;
  }
  return Math.max(0, Math.min(1, (hours - TIMELINE_START_HOUR) / TIMELINE_HOURS));
}

function alarmTimeToFraction(hour: number, minute: number): number {
  let hours = hour + minute / 60;
  if (hours < TIMELINE_START_HOUR) {
    hours += 24;
  }
  return Math.max(0, Math.min(1, (hours - TIMELINE_START_HOUR) / TIMELINE_HOURS));
}

export function SleepTimelineBar({
  bedtime,
  wakeTime,
  targetTime,
  dismissedAt,
  compact = false,
}: SleepTimelineBarProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const height = compact ? 60 : 100;
  const barY = compact ? 8 : 16;
  const barHeight = compact ? 28 : 40;
  const labelY = height - 4;

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  const drawWidth = containerWidth - PADDING_X * 2;

  const toX = (fraction: number): number => PADDING_X + fraction * drawWidth;

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {containerWidth > 0 && (
        <Svg width={containerWidth} height={height}>
          {/* Background track */}
          <Rect
            x={PADDING_X}
            y={barY}
            width={drawWidth}
            height={barHeight}
            rx={barHeight / 2}
            fill={colors.surface}
          />

          {/* Sleep range */}
          {bedtime != null &&
            wakeTime != null &&
            (() => {
              const startFrac = timeToFraction(bedtime);
              const endFrac = timeToFraction(wakeTime);
              const x = toX(startFrac);
              const w = (endFrac - startFrac) * drawWidth;
              return (
                <Rect
                  x={x}
                  y={barY}
                  width={Math.max(0, w)}
                  height={barHeight}
                  rx={barHeight / 2}
                  fill={colors.primary}
                  opacity={0.5}
                />
              );
            })()}

          {/* Target time marker (dashed line) */}
          {targetTime != null &&
            (() => {
              const x = toX(alarmTimeToFraction(targetTime.hour, targetTime.minute));
              return (
                <Line
                  x1={x}
                  y1={barY - 4}
                  x2={x}
                  y2={barY + barHeight + 4}
                  stroke={colors.warning}
                  strokeWidth={2}
                  strokeDasharray="4,3"
                />
              );
            })()}

          {/* Dismissed time marker (solid line) */}
          {dismissedAt != null &&
            (() => {
              const x = toX(timeToFraction(dismissedAt));
              return (
                <Line
                  x1={x}
                  y1={barY - 4}
                  x2={x}
                  y2={barY + barHeight + 4}
                  stroke={colors.success}
                  strokeWidth={2}
                />
              );
            })()}

          {/* Hour labels (non-compact only) */}
          {!compact &&
            HOUR_LABELS.map((hour) => {
              let h = hour;
              if (h < TIMELINE_START_HOUR) h += 24;
              const frac = (h - TIMELINE_START_HOUR) / TIMELINE_HOURS;
              return (
                <SvgText
                  key={hour}
                  x={toX(frac)}
                  y={labelY}
                  fill={colors.textMuted}
                  fontSize={10}
                  textAnchor="middle"
                >
                  {`${hour}`}
                </SvgText>
              );
            })}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
});
