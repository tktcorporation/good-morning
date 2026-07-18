import { View } from 'react-native';
import { SquatChallengeItem } from 'good-morning';

/**
 * SquatChallengeItem のプレビュー。
 * useSquatDetector はモック加速度センサー（イベントを一切発火しない）を購読するが、
 * `isListening` は購読開始時点で true になるため、未完了状態では実機のスクワット検出
 * なしでも「検出中」のパルスドット表示に自然に到達する（プログレスリングと合わせて
 * in-progress / completed の見た目の差分をカバー）。
 */

export function InProgress() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <SquatChallengeItem
        todo={{
          id: 'squat-1',
          title: 'スクワット',
          completed: false,
          completedAt: null,
          type: 'squat',
          requiredCount: 10,
          currentCount: 4,
        }}
        onIncrement={() => {}}
        onComplete={() => {}}
      />
    </View>
  );
}

export function JustStarted() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <SquatChallengeItem
        todo={{
          id: 'squat-2',
          title: 'スクワット',
          completed: false,
          completedAt: null,
          type: 'squat',
          requiredCount: 10,
          currentCount: 0,
        }}
        onIncrement={() => {}}
        onComplete={() => {}}
      />
    </View>
  );
}

export function Completed() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <SquatChallengeItem
        todo={{
          id: 'squat-3',
          title: 'スクワット',
          completed: true,
          completedAt: '2026-07-18T06:32:10.000Z',
          type: 'squat',
          requiredCount: 10,
          currentCount: 10,
        }}
        onIncrement={() => {}}
        onComplete={() => {}}
      />
    </View>
  );
}
