import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SquatChallengeItem } from '../src/components/SquatChallengeItem';
import { borderRadius, colors, commonStyles, fontSize, spacing } from '../src/constants/theme';
import { useMotionDebug } from '../src/hooks/useMotionDebug';
import { SQUAT_THRESHOLDS } from '../src/hooks/useSquatDetector';
import type { SessionTodo } from '../src/types/morning-session';

/**
 * スクワット検出の動作確認画面。
 *
 * 背景: 端末・体格・センサー個体差で検出感度が変わるため、
 * アラーム本番（app/(tabs)/index.tsx の MorningRoutineSection）と
 * まったく同じコンポーネント (SquatChallengeItem) を使い、
 * 朝のフローを発火させずに検出挙動だけを確認できるようにする。
 *
 * さらに、閾値調整や「他にどんな動きが取れそうか」を検討するため、
 * 各モーションセンサー（加速度・ジャイロ・磁気・気圧）と歩数（Pedometer）の
 * リアルタイム値をデバッグセクションに表示する。
 */
const REQUIRED_COUNT = 10;

function createInitialTodo(): SessionTodo {
  return {
    id: 'squat-check',
    title: 'Squat',
    completed: false,
    completedAt: null,
    type: 'squat',
    requiredCount: REQUIRED_COUNT,
    currentCount: 0,
  };
}

export default function SquatCheckScreen() {
  const { t } = useTranslation('common');
  const [todo, setTodo] = useState<SessionTodo>(createInitialTodo);
  /**
   * SquatChallengeItem を強制リマウントするためのキー。
   *
   * useSquatDetector は内部に検出回数の useState を持つため、todo を初期化するだけだと
   * 「前回の累積カウント + 1」で targetCount に到達してしまい、1 回のスクワットで
   * 完了扱いになる（Codex 指摘 PR #72）。key を変えて子ツリーを unmount → mount し、
   * フック内部の state も含めて確実にリセットする。
   */
  const [resetId, setResetId] = useState(0);
  const debug = useMotionDebug(true);

  const handleIncrement = useCallback((_id: string) => {
    setTodo((prev) => ({ ...prev, currentCount: (prev.currentCount ?? 0) + 1 }));
  }, []);

  const handleComplete = useCallback((_id: string) => {
    setTodo((prev) => ({
      ...prev,
      completed: true,
      completedAt: new Date().toISOString(),
    }));
  }, []);

  const handleReset = useCallback(() => {
    setTodo(createInitialTodo());
    setResetId((id) => id + 1);
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={commonStyles.section}>
        <Text style={styles.description}>{t('squatCheck.description')}</Text>
      </View>

      <View style={commonStyles.section}>
        <SquatChallengeItem
          key={resetId}
          todo={todo}
          onIncrement={handleIncrement}
          onComplete={handleComplete}
        />
      </View>

      <Pressable style={styles.resetButton} onPress={handleReset}>
        <Text style={styles.resetButtonText}>{t('squatCheck.reset')}</Text>
      </Pressable>

      <DebugSection debug={debug} />
    </ScrollView>
  );
}

interface DebugSectionProps {
  readonly debug: ReturnType<typeof useMotionDebug>;
}

/**
 * リアルタイムのセンサー値・歩数・スクワット判定状態を表示するセクション。
 *
 * 数値は tabular-nums + 固定小数で揃えて、サンプル毎の再描画でレイアウトが
 * 揺れないようにする。
 */
function DebugSection({ debug }: DebugSectionProps) {
  const { t } = useTranslation('common');

  return (
    <View style={[commonStyles.section, styles.debugContainer]}>
      <Text style={styles.debugTitle}>{t('squatCheck.debug.title')}</Text>
      <Text style={styles.debugSubtitle}>{t('squatCheck.debug.subtitle')}</Text>

      {/* スクワット判定の現在状態 */}
      <DebugBlock title={t('squatCheck.debug.squatState.title')}>
        <DebugRow
          label={t('squatCheck.debug.squatState.phase')}
          value={t(`squatCheck.debug.squatState.phases.${debug.squatPhase}`)}
        />
        <DebugRow
          label={t('squatCheck.debug.squatState.minMagnitude')}
          value={fmtNum(debug.minMagnitude, 2)}
        />
        <DebugRow
          label={t('squatCheck.debug.squatState.maxMagnitude')}
          value={fmtNum(debug.maxMagnitude, 2)}
        />
        <DebugRow
          label={t('squatCheck.debug.squatState.thresholds')}
          value={`< ${SQUAT_THRESHOLDS.DESCEND_THRESHOLD} → > ${SQUAT_THRESHOLDS.RISE_THRESHOLD} → < ${SQUAT_THRESHOLDS.STANDING_THRESHOLD}`}
        />
      </DebugBlock>

      {/* 加速度センサー */}
      <DebugBlock
        title={t('squatCheck.debug.accelerometer.title')}
        availability={debug.accelerometerAvailable}
      >
        <DebugRow label="x" value={fmtNum(debug.accelerometer?.x, 3)} />
        <DebugRow label="y" value={fmtNum(debug.accelerometer?.y, 3)} />
        <DebugRow label="z" value={fmtNum(debug.accelerometer?.z, 3)} />
        <DebugRow
          label={t('squatCheck.debug.accelerometer.magnitude')}
          value={fmtNum(debug.accelerometer?.magnitude, 3)}
          highlight
        />
      </DebugBlock>

      {/* ジャイロスコープ */}
      <DebugBlock
        title={t('squatCheck.debug.gyroscope.title')}
        availability={debug.gyroscopeAvailable}
      >
        <DebugRow label="x" value={fmtNum(debug.gyroscope?.x, 3)} />
        <DebugRow label="y" value={fmtNum(debug.gyroscope?.y, 3)} />
        <DebugRow label="z" value={fmtNum(debug.gyroscope?.z, 3)} />
      </DebugBlock>

      {/* 磁気センサー */}
      <DebugBlock
        title={t('squatCheck.debug.magnetometer.title')}
        availability={debug.magnetometerAvailable}
      >
        <DebugRow label="x" value={fmtNum(debug.magnetometer?.x, 1)} />
        <DebugRow label="y" value={fmtNum(debug.magnetometer?.y, 1)} />
        <DebugRow label="z" value={fmtNum(debug.magnetometer?.z, 1)} />
      </DebugBlock>

      {/* 気圧計 */}
      <DebugBlock
        title={t('squatCheck.debug.barometer.title')}
        availability={debug.barometerAvailable}
      >
        <DebugRow
          label={t('squatCheck.debug.barometer.pressure')}
          value={fmtNum(debug.barometer?.pressure, 2)}
          unit="hPa"
        />
        <DebugRow
          label={t('squatCheck.debug.barometer.relativeAltitude')}
          value={fmtNum(debug.barometer?.relativeAltitude, 2)}
          unit="m"
        />
      </DebugBlock>

      {/* 歩数（Pedometer / HealthKit） */}
      <DebugBlock
        title={t('squatCheck.debug.pedometer.title')}
        availability={debug.pedometer.availability}
        errorMessage={debug.pedometer.error}
      >
        <DebugRow
          label={t('squatCheck.debug.pedometer.permission')}
          value={
            debug.pedometer.permissionGranted === null
              ? '—'
              : debug.pedometer.permissionGranted
                ? t('squatCheck.debug.pedometer.permissionGranted')
                : t('squatCheck.debug.pedometer.permissionDenied')
          }
        />
        <DebugRow
          label={t('squatCheck.debug.pedometer.stepsToday')}
          value={debug.pedometer.stepsToday === null ? '—' : String(debug.pedometer.stepsToday)}
          highlight
        />
        <DebugRow
          label={t('squatCheck.debug.pedometer.stepsSinceWatchStart')}
          value={String(debug.pedometer.stepsSinceWatchStart)}
        />
        {/*
         * available でも fetchTodaySteps が個別に失敗したケース（HealthKit 認可拒否や
         * 7-days 制限など）はここで表示する。unavailable 時は DebugBlock 側に出る。
         */}
        {debug.pedometer.error !== null && debug.pedometer.availability === 'available' && (
          <DebugRow label={t('squatCheck.debug.pedometer.error')} value={debug.pedometer.error} />
        )}
      </DebugBlock>
    </View>
  );
}

interface DebugBlockProps {
  readonly title: string;
  readonly availability?: 'unknown' | 'available' | 'unavailable';
  /**
   * unavailable 時に表示したいエラーメッセージ。例外で unavailable 化したケースを
   * デバッグするために必須。空 children と組み合わせて「unavailable だが原因は分かる」
   * 状態を表現する。
   */
  readonly errorMessage?: string | null;
  readonly children: React.ReactNode;
}

function DebugBlock({ title, availability, errorMessage, children }: DebugBlockProps) {
  const { t } = useTranslation('common');
  const showUnavailable = availability === 'unavailable';
  return (
    <View style={styles.debugBlock}>
      <View style={styles.debugBlockHeader}>
        <Text style={styles.debugBlockTitle}>{title}</Text>
        {availability !== undefined && availability !== 'available' ? (
          <Text style={[styles.debugBadge, showUnavailable && styles.debugBadgeUnavailable]}>
            {showUnavailable ? t('squatCheck.debug.unavailable') : t('squatCheck.debug.checking')}
          </Text>
        ) : null}
      </View>
      {/*
       * unavailable でも errorMessage があれば原因を表示する。これがないと
       * 例外で unavailable 化したケース（権限取得失敗・native link 不備など）の
       * 原因が画面から消えてしまい、デバッグ画面の意義が損なわれる。
       */}
      {showUnavailable ? (
        errorMessage !== null && errorMessage !== undefined && errorMessage !== '' ? (
          <Text style={styles.debugErrorText}>{errorMessage}</Text>
        ) : null
      ) : (
        children
      )}
    </View>
  );
}

interface DebugRowProps {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly highlight?: boolean;
}

function DebugRow({ label, value, unit, highlight }: DebugRowProps) {
  return (
    <View style={styles.debugRow}>
      <Text style={styles.debugRowLabel}>{label}</Text>
      <Text style={[styles.debugRowValue, highlight && styles.debugRowValueHighlight]}>
        {value}
        {unit !== undefined && <Text style={styles.debugRowUnit}>{` ${unit}`}</Text>}
      </Text>
    </View>
  );
}

/**
 * 数値を固定小数で文字列化する。null / undefined / NaN は em-dash で表す。
 * 高頻度更新でも UI のレイアウトが揺れないよう、必ず同じ桁数で返す。
 */
function fmtNum(value: number | null | undefined, fractionDigits: number): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toFixed(fractionDigits);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    padding: spacing.md,
  },
  description: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  resetButton: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  resetButtonText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  debugContainer: {
    marginTop: spacing.lg,
  },
  debugTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  debugSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  debugBlock: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  debugBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  debugBlockTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  debugBadge: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  debugBadgeUnavailable: {
    color: colors.textMuted,
  },
  // unavailable バッジの下に出すエラー詳細。warning 色で目立たせる
  debugErrorText: {
    fontSize: fontSize.sm,
    color: colors.warning,
    lineHeight: 18,
  },
  debugRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 2,
  },
  debugRowLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  debugRowValue: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  debugRowValueHighlight: {
    color: colors.primary,
    fontWeight: '600',
  },
  debugRowUnit: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
});
