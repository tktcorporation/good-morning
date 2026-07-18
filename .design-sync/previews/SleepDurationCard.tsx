import { View } from 'react-native';
import { SleepDurationCard } from 'good-morning';

const noop = () => {};

export function Unset() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <SleepDurationCard
        alarmTime={{ hour: 7, minute: 0 }}
        targetSleepMinutes={null}
        onSleepMinutesChange={noop}
      />
    </View>
  );
}

export function EightHours() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <SleepDurationCard
        alarmTime={{ hour: 7, minute: 0 }}
        targetSleepMinutes={480}
        onSleepMinutesChange={noop}
      />
    </View>
  );
}

export function FiveHours() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <SleepDurationCard
        alarmTime={{ hour: 6, minute: 0 }}
        targetSleepMinutes={300}
        onSleepMinutesChange={noop}
      />
    </View>
  );
}
