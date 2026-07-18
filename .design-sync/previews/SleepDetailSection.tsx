import { View } from 'react-native';
import { SleepDetailSection, useSettingsStore } from 'good-morning';

// SleepDetailSection returns null outright when HealthKit isn't connected
// in the shared settings store, so every story needs it primed to true
// before first mount. A disconnected story would just render nothing, so
// unlike SleepCard there's no useful "off" state to preview here.
useSettingsStore.setState({ healthKitEnabled: true });

export function Loading() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <SleepDetailSection
        summary={{ date: '2026-07-18', loading: true, sleep: null, record: undefined }}
      />
    </View>
  );
}

export function NoData() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <SleepDetailSection
        summary={{ date: '2026-07-18', loading: false, sleep: null, record: undefined }}
      />
    </View>
  );
}

export function WithRecord() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <SleepDetailSection
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
      <SleepDetailSection
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
