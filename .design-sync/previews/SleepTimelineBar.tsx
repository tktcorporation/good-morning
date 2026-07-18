import { View } from 'react-native';
import { SleepTimelineBar } from 'good-morning';

export function CompactWithMarkers() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <SleepTimelineBar
        bedtime={new Date('2026-07-17T23:10:00')}
        wakeTime={new Date('2026-07-18T06:45:00')}
        targetTime={{ hour: 7, minute: 0 }}
        dismissedAt={new Date('2026-07-18T06:52:00')}
        compact
      />
    </View>
  );
}

export function FullWithMarkers() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <SleepTimelineBar
        bedtime={new Date('2026-07-17T23:10:00')}
        wakeTime={new Date('2026-07-18T06:45:00')}
        targetTime={{ hour: 7, minute: 0 }}
        dismissedAt={new Date('2026-07-18T06:52:00')}
      />
    </View>
  );
}

export function NoMarkers() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <SleepTimelineBar
        bedtime={new Date('2026-07-17T00:20:00')}
        wakeTime={new Date('2026-07-17T08:05:00')}
        targetTime={null}
        dismissedAt={null}
      />
    </View>
  );
}

export function NoData() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <SleepTimelineBar bedtime={null} wakeTime={null} targetTime={null} dismissedAt={null} />
    </View>
  );
}
