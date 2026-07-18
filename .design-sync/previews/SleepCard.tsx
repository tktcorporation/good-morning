import { View } from 'react-native';
import { SleepCard } from 'good-morning';
import { useSettingsStore } from '../../src/stores/settings-store';

// SleepCard reads healthKitEnabled from the shared settings store and shows
// a "connect" prompt (not the summary) while it's false. Every ?story=
// capture is a fresh page load that re-evaluates this module, so gating on
// the capture harness's own `story` query param lets one module-scope call
// prime the store for every story except NotConnected, which previews the
// real disconnected default.
const story = new URLSearchParams(window.location.search).get('story');
if (story !== 'NotConnected') {
  useSettingsStore.setState({ healthKitEnabled: true });
}

export function NotConnected() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <SleepCard summary={{ date: '2026-07-18', loading: false, sleep: null, record: undefined }} />
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <SleepCard summary={{ date: '2026-07-18', loading: true, sleep: null, record: undefined }} />
    </View>
  );
}

export function NoData() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <SleepCard summary={{ date: '2026-07-18', loading: false, sleep: null, record: undefined }} />
    </View>
  );
}

export function WithRecord() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <SleepCard
        summary={{
          date: '2026-07-18',
          loading: false,
          sleep: {
            bedtime: '2026-07-17T23:10:00',
            wakeUpTime: '2026-07-18T06:45:00',
            totalMinutes: 455,
          },
          record: {
            id: 'wake_1',
            alarmId: 'alarm_1',
            date: '2026-07-18',
            targetTime: { hour: 7, minute: 0 },
            alarmTriggeredAt: '2026-07-18T07:00:00',
            dismissedAt: '2026-07-18T06:52:00',
            healthKitWakeTime: '2026-07-18T06:45:00',
            result: 'great',
            diffMinutes: -8,
            todos: [],
            todoCompletionSeconds: 90,
            alarmLabel: '平日',
            todosCompleted: true,
            todosCompletedAt: '2026-07-18T06:52:00',
            goalDeadline: '2026-07-18T07:10:00',
          },
        }}
      />
    </View>
  );
}

export function WithoutRecord() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <SleepCard
        summary={{
          date: '2026-07-17',
          loading: false,
          sleep: {
            bedtime: '2026-07-17T00:20:00',
            wakeUpTime: '2026-07-17T08:05:00',
            totalMinutes: 465,
          },
          record: undefined,
        }}
      />
    </View>
  );
}
