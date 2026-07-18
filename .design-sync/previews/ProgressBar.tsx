import { View } from 'react-native';
import { ProgressBar } from 'good-morning';

export function Empty() {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <ProgressBar ratio={0} height={8} />
    </View>
  );
}

export function Half() {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <ProgressBar ratio={0.5} height={8} />
    </View>
  );
}

export function AlmostDone() {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <ProgressBar ratio={0.9} height={8} />
    </View>
  );
}

export function CustomColors() {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <ProgressBar ratio={0.6} height={12} trackColor="#2a2a4e" fillColor="#e94560" />
    </View>
  );
}
