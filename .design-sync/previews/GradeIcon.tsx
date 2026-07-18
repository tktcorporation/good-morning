import { View } from 'react-native';
import { GradeIcon } from 'good-morning';

// 4段階のグレード + 未確定(null)を1セルずつ並べ、色の違いをセル間で明確に比較できるようにする。
// size は実プロダクトでの主な使用値（DailyGradeSectionの大アイコン size=48、
// デフォルトの size=24）を Sizes セルでまとめて確認する。

export function Excellent() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <GradeIcon grade="excellent" size={48} />
    </View>
  );
}

export function Good() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <GradeIcon grade="good" size={48} />
    </View>
  );
}

export function Fair() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <GradeIcon grade="fair" size={48} />
    </View>
  );
}

export function Poor() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <GradeIcon grade="poor" size={48} />
    </View>
  );
}

export function Undetermined() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <GradeIcon grade={null} size={48} />
    </View>
  );
}

export function Sizes() {
  return (
    <View
      style={{
        padding: 16,
        backgroundColor: '#1a1a2e',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <GradeIcon grade="excellent" size={16} />
      <GradeIcon grade="excellent" size={24} />
      <GradeIcon grade="excellent" size={48} />
      <GradeIcon grade="excellent" size={72} />
    </View>
  );
}
