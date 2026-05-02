/**
 * useSquatDetector フックのライフサイクル回帰テスト。
 *
 * 検証目的:
 * - targetCount が変わってもセンサー購読が作り直されない
 *   （SquatChallengeItem は `targetCount = required - current` を渡すので、
 *    カウントごとに targetCount が減る。再購読のたびに stateRef を
 *    初期化する旧実装では debounce 履歴が消え、二重カウントが起きた）
 * - enabled が false → true になったときは再購読される（センサー停止/再開）
 */

import { Accelerometer } from 'expo-sensors';
import { useSquatDetector } from '../hooks/useSquatDetector';

// react-test-renderer は jest-expo が依存に持つが型定義は配布されていない。
// 既存の app-screens-render.smoke.test.tsx と同じく require + any 経由で読む。
// biome-ignore lint/suspicious/noExplicitAny: runtime-only module without published types
const TestRenderer = require('react-test-renderer') as any;

const accelerometerMock = Accelerometer as unknown as {
  addListener: jest.Mock;
  setUpdateInterval: jest.Mock;
};

interface ProbeProps {
  enabled: boolean;
  targetCount: number;
  onSquat: () => void;
  onComplete: () => void;
}

function Probe({ enabled, targetCount, onSquat, onComplete }: ProbeProps) {
  useSquatDetector(enabled, targetCount, onSquat, onComplete);
  return null;
}

describe('useSquatDetector — ライフサイクル', () => {
  beforeEach(() => {
    accelerometerMock.addListener.mockClear();
    accelerometerMock.setUpdateInterval.mockClear();
    accelerometerMock.addListener.mockImplementation(() => ({ remove: jest.fn() }));
  });

  test('targetCount が変化しても再購読されない（debounce 履歴を保護）', () => {
    const onSquat = jest.fn();
    const onComplete = jest.fn();

    // biome-ignore lint/suspicious/noExplicitAny: react-test-renderer types are not published
    let renderer: any = null;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <Probe enabled={true} targetCount={10} onSquat={onSquat} onComplete={onComplete} />,
      );
    });

    expect(accelerometerMock.addListener).toHaveBeenCalledTimes(1);

    // SquatChallengeItem のように targetCount を減らして再レンダー（required - current）
    TestRenderer.act(() => {
      renderer.update(
        <Probe enabled={true} targetCount={9} onSquat={onSquat} onComplete={onComplete} />,
      );
    });
    TestRenderer.act(() => {
      renderer.update(
        <Probe enabled={true} targetCount={8} onSquat={onSquat} onComplete={onComplete} />,
      );
    });

    // 依存に targetCount が含まれていれば +2 回 addListener が走るはず。
    // ref 経由参照で deps から外しているので 1 回のままが正解。
    expect(accelerometerMock.addListener).toHaveBeenCalledTimes(1);

    TestRenderer.act(() => {
      renderer.unmount();
    });
  });

  test('enabled が false → true で再購読される（停止/再開は意図通り）', () => {
    const onSquat = jest.fn();
    const onComplete = jest.fn();

    // biome-ignore lint/suspicious/noExplicitAny: react-test-renderer types are not published
    let renderer: any = null;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <Probe enabled={true} targetCount={10} onSquat={onSquat} onComplete={onComplete} />,
      );
    });
    expect(accelerometerMock.addListener).toHaveBeenCalledTimes(1);

    TestRenderer.act(() => {
      renderer.update(
        <Probe enabled={false} targetCount={10} onSquat={onSquat} onComplete={onComplete} />,
      );
    });
    // enabled=false では新規購読しない
    expect(accelerometerMock.addListener).toHaveBeenCalledTimes(1);

    TestRenderer.act(() => {
      renderer.update(
        <Probe enabled={true} targetCount={10} onSquat={onSquat} onComplete={onComplete} />,
      );
    });
    // enabled=true に戻したら再購読される
    expect(accelerometerMock.addListener).toHaveBeenCalledTimes(2);

    TestRenderer.act(() => {
      renderer.unmount();
    });
  });

  test('targetCount は最新値が onComplete 判定に使われる', () => {
    const onSquat = jest.fn();
    const onComplete = jest.fn();

    let listenerFn: ((s: { x: number; y: number; z: number }) => void) | null = null;
    accelerometerMock.addListener.mockImplementation((fn) => {
      listenerFn = fn as typeof listenerFn;
      return { remove: jest.fn() };
    });

    // biome-ignore lint/suspicious/noExplicitAny: react-test-renderer types are not published
    let renderer: any = null;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <Probe enabled={true} targetCount={5} onSquat={onSquat} onComplete={onComplete} />,
      );
    });

    // targetCount を 1 に下げる（再購読は走らない）
    TestRenderer.act(() => {
      renderer.update(
        <Probe enabled={true} targetCount={1} onSquat={onSquat} onComplete={onComplete} />,
      );
    });

    // 1 回スクワットを発火させる: dip → peak → cooldown
    // expo-sensors の Accelerometer は g 単位なので 0.7g / 1.4g を流す
    // タイミング制御のため Date.now をフリーズ
    const realNow = Date.now;
    let t = 1_000_000;
    Date.now = () => t;
    try {
      const fire = (raw: number, dt: number) => {
        t += dt;
        // 3 軸合成 magnitude が raw になるよう x のみ調整
        TestRenderer.act(() => {
          listenerFn?.({ x: raw, y: 0, z: 0 });
        });
      };
      // EMA(α=0.4) を確実に閾値の向こう側まで動かすため、強めの signal を流す。
      // 静止 → 深いディップ × 数サンプル → 大きなピーク × 数サンプル。
      fire(1.0, 0);
      fire(0.5, 100); // smoothed → ~0.8（dipped）
      fire(0.5, 100);
      fire(0.5, 100); // smoothed → ~0.6
      fire(1.7, 100); // smoothed → ~1.04
      fire(1.7, 100); // smoothed → ~1.31（peaked）
      fire(1.7, 100); // smoothed → ~1.46（peaked, MIN_PEAK_MS 経過 → count）
    } finally {
      Date.now = realNow;
    }

    expect(onSquat).toHaveBeenCalledTimes(1);
    // targetCount(=1) に達したので onComplete も呼ばれる
    expect(onComplete).toHaveBeenCalledTimes(1);

    TestRenderer.act(() => {
      renderer.unmount();
    });
  });
});
