import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { borderRadius, colors, fontSize, spacing } from '../constants/theme';
import { useSquatDetector } from '../hooks/useSquatDetector';
import type { SessionTodo } from '../types/morning-session';

interface SquatChallengeItemProps {
  readonly todo: SessionTodo;
  /** スクワット1回検出時に呼ばれる。ストアの incrementTodoCount を渡す。 */
  readonly onIncrement: (id: string) => void;
  /** 目標回数達成時に呼ばれる。完了エフェクトのトリガー用。 */
  readonly onComplete: (id: string) => void;
}

const RING_SIZE = 80;
const STROKE_WIDTH = 6;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * スクワットチャレンジの UI。プログレスリング + カウント + 開始/完了状態を表示。
 *
 * 背景: チェックボックスタップだけでは寝ぼけたまま完了できてしまうため、
 * 加速度センサーで実際のスクワット動作を検出するフィジカルチャレンジを提供する。
 */
export function SquatChallengeItem({ todo, onIncrement, onComplete }: SquatChallengeItemProps) {
  const { t } = useTranslation('dashboard');
  const required = todo.requiredCount ?? 10;
  const current = todo.currentCount ?? 0;
  const progress = Math.min(current / required, 1);

  const handleSquat = useCallback(() => {
    onIncrement(todo.id);
  }, [onIncrement, todo.id]);

  const handleComplete = useCallback(() => {
    onComplete(todo.id);
  }, [onComplete, todo.id]);

  // センサーは未完了の間だけ有効にする（完了後はバッテリー節約のため停止）
  const { isListening } = useSquatDetector(
    !todo.completed,
    required - current,
    handleSquat,
    handleComplete,
  );

  // プログレスリングの stroke-dashoffset
  const strokeDashoffset = useMemo(() => CIRCUMFERENCE * (1 - progress), [progress]);

  return (
    <View style={[styles.container, todo.completed && styles.containerCompleted]}>
      <View style={styles.ringContainer}>
        <Svg width={RING_SIZE} height={RING_SIZE}>
          {/* 背景リング */}
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            stroke={colors.surface}
            strokeWidth={STROKE_WIDTH}
            fill="none"
          />
          {/* プログレスリング */}
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            stroke={todo.completed ? colors.success : colors.primary}
            strokeWidth={STROKE_WIDTH}
            fill="none"
            strokeDasharray={`${CIRCUMFERENCE}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            rotation={-90}
            origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
          />
        </Svg>
        <View style={styles.countOverlay}>
          <Text style={[styles.countText, todo.completed && styles.countTextCompleted]}>
            {`${current}`}
          </Text>
          <Text style={styles.countTarget}>{`/${required}`}</Text>
        </View>
      </View>

      <View style={styles.info}>
        <Text style={[styles.title, todo.completed && styles.titleCompleted]}>{todo.title}</Text>
        {todo.completed ? (
          <Text style={styles.doneLabel}>{t('morningRoutine.squat.done')}</Text>
        ) : isListening ? (
          <Pressable style={styles.activeIndicator}>
            <View style={styles.pulsingDot} />
            <Text style={styles.activeText}>{t('morningRoutine.squat.detecting')}</Text>
          </Pressable>
        ) : (
          <Text style={styles.waitingText}>{t('morningRoutine.squat.waiting')}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  containerCompleted: {
    opacity: 0.7,
  },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  countOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  countText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  countTextCompleted: {
    color: colors.success,
  },
  countTarget: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  doneLabel: {
    fontSize: fontSize.sm,
    color: colors.success,
    fontWeight: '600',
  },
  activeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginRight: spacing.xs,
  },
  activeText: {
    fontSize: fontSize.sm,
    color: colors.primaryLight,
  },
  waitingText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
