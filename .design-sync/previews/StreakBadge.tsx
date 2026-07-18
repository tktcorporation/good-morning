import { View } from 'react-native';
import { StreakBadge } from 'good-morning';

// currentStreak (0 / 中間 / 高め) と freezesAvailable (0-2) の組み合わせをセル間で
// スイープし、数字と保険(フリーズ)の見え方の違いを比較できるようにする。

export function NoStreak() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <StreakBadge currentStreak={0} freezesAvailable={0} />
    </View>
  );
}

export function GrowingStreak() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <StreakBadge currentStreak={5} freezesAvailable={1} />
    </View>
  );
}

export function LongStreak() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <StreakBadge currentStreak={30} freezesAvailable={2} />
    </View>
  );
}

export function HighStreakNoFreezes() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <StreakBadge currentStreak={30} freezesAvailable={0} />
    </View>
  );
}
