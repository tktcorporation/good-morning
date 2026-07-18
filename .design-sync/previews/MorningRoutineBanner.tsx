import { View } from 'react-native';
import { MorningRoutineBanner } from 'good-morning';
// コンポーネントが読むのと同一インスタンスを共有するため、パッケージ経由ではなく
// 相対パスで直接インポートする（esbuild は解決後の絶対パスでモジュールを重複排除する）。
// good-morning パッケージは .design-sync/.cache/web-nm/node_modules/good-morning/src/
// の同期コピーを指すため、実リポジトリの src/ ではなくこちらを指す必要がある
// （実 src/ を指すと node_modules 解決がリポジトリ本物の node_modules/react-native
// （Flow 構文）まで辿ってしまいビルドが壊れる）。
import { useMorningSessionStore } from '../.cache/web-nm/node_modules/good-morning/src/stores/morning-session-store';

/**
 * MorningRoutineBanner は props を持たず、Zustand ストアの session を直接購読して
 * session === null なら null を返す。ストーリーごとの関数本体は React が
 * <MorningRoutineBanner /> をレンダリングするより先に同期実行されるため、
 * ここで session をセットしておけば初回レンダリングから正しい進捗が表示される。
 */
function seedSession(
  todos: ReadonlyArray<{
    id: string;
    title: string;
    completed: boolean;
    completedAt: string | null;
    type?: 'checkbox' | 'squat';
    requiredCount?: number;
    currentCount?: number;
  }>,
) {
  useMorningSessionStore.setState({
    session: {
      recordId: 'r1',
      date: '2026-07-18',
      startedAt: new Date().toISOString(),
      todos,
      windowEnd: new Date(Date.now() + 3600000).toISOString(),
      liveActivityId: null,
      goalDeadline: null,
      snoozeAlarmIds: [],
      snoozeFiresAt: null,
    },
  });
}

export function PartiallyComplete() {
  seedSession([
    { id: 'st-1', title: '水を一杯飲む', completed: true, completedAt: '2026-07-18T06:20:00.000Z' },
    { id: 'st-2', title: 'カーテンを開ける', completed: true, completedAt: '2026-07-18T06:21:30.000Z' },
    {
      id: 'st-3',
      title: 'Squat',
      completed: false,
      completedAt: null,
      type: 'squat',
      requiredCount: 10,
      currentCount: 4,
    },
    { id: 'st-4', title: '歯を磨く', completed: false, completedAt: null },
  ]);

  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <MorningRoutineBanner />
    </View>
  );
}

export function NearlyComplete() {
  seedSession([
    { id: 'st-1', title: '水を一杯飲む', completed: true, completedAt: '2026-07-18T06:20:00.000Z' },
    { id: 'st-2', title: 'カーテンを開ける', completed: true, completedAt: '2026-07-18T06:21:30.000Z' },
    {
      id: 'st-3',
      title: 'Squat',
      completed: true,
      completedAt: '2026-07-18T06:23:05.000Z',
      type: 'squat',
      requiredCount: 10,
      currentCount: 10,
    },
    { id: 'st-4', title: '歯を磨く', completed: false, completedAt: null },
  ]);

  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <MorningRoutineBanner />
    </View>
  );
}
