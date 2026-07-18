import { View } from 'react-native';
import { TimeStep } from 'good-morning';

export function EarlyMorning() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e', height: 640 }}>
      <TimeStep time={{ hour: 6, minute: 30 }} setTime={() => {}} onNext={() => {}} onBack={() => {}} />
    </View>
  );
}

export function LateMorning() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e', height: 640 }}>
      <TimeStep time={{ hour: 9, minute: 15 }} setTime={() => {}} onNext={() => {}} onBack={() => {}} />
    </View>
  );
}
