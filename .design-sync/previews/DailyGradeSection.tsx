import { View } from 'react-native';
import { DailyGradeSection } from 'good-morning';

const baseStreak = { currentStreak: 5, longestStreak: 12, freezesAvailable: 1, freezesUsedTotal: 3, lastGradedDate: '2026-07-17' };

export function Excellent() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <DailyGradeSection
        gradeRecord={{
          date: '2026-07-17',
          grade: 'excellent',
          morningPass: true,
          bedtimeResult: 'onTime',
          bedtimeTarget: '23:00',
          actualBedtime: '2026-07-16T22:50:00.000Z',
        }}
        streak={baseStreak}
      />
    </View>
  );
}

export function Poor() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <DailyGradeSection
        gradeRecord={{
          date: '2026-07-17',
          grade: 'poor',
          morningPass: false,
          bedtimeResult: 'late',
          bedtimeTarget: '23:00',
          actualBedtime: '2026-07-17T01:20:00.000Z',
        }}
        streak={{ ...baseStreak, currentStreak: 0, freezesAvailable: 0 }}
      />
    </View>
  );
}

export function Undetermined() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <DailyGradeSection gradeRecord={undefined} streak={{ ...baseStreak, currentStreak: 3 }} />
    </View>
  );
}
