import { StyleSheet, View } from 'react-native';
import { borderRadius, colors } from '../constants/theme';

interface ProgressBarProps {
  /** 進捗率（0–1）。範囲外にならないよう、total=0 のガードは呼び出し側で行う。 */
  readonly ratio: number;
  /** バーの高さ（px）。トラックごとに見た目が異なるため必須にする。 */
  readonly height: number;
  readonly trackColor?: string;
  readonly fillColor?: string;
}

/** トラックと塗りだけの presentational なプログレスバー。 */
export function ProgressBar({
  ratio,
  height,
  trackColor = colors.surface,
  fillColor = colors.success,
}: ProgressBarProps) {
  return (
    <View style={[styles.track, { height, backgroundColor: trackColor }]}>
      <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: fillColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
});
