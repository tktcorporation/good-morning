import { Accelerometer } from 'expo-sensors';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * スクワット検出のステートマシン状態。
 *
 * standing → descending（下降検出）→ rising（上昇検出）→ standing（1回カウント）
 *
 * 端末の向きに依存しないよう、3軸の合成加速度（magnitude）を使用する。
 * 静止時は約 9.8 m/s²、しゃがむと一時的に減少し、立ち上がると増加する。
 */
type SquatPhase = 'standing' | 'descending' | 'rising';

// 3軸合成加速度の閾値。
// 静止時の magnitude ≈ 9.8。しゃがむと < 9.0、立ち上がると > 10.5 程度になる。
const DESCEND_THRESHOLD = 9.0;
const RISE_THRESHOLD = 10.5;
const STANDING_THRESHOLD = 9.5;
/** 連続検出を防ぐ最小間隔（ms）。人間のスクワット1回は最低でも1秒以上かかる。 */
const DEBOUNCE_MS = 800;

/**
 * 加速度の magnitude と現在のフェーズから次のフェーズを決定する純粋関数。
 * useEffect 内のコールバックから切り出すことで認知複雑度を下げている。
 *
 * @returns 新しいフェーズ。'counted' は1回のスクワット完了を意味する。
 */
function nextPhase(phase: SquatPhase, magnitude: number): SquatPhase | 'counted' {
  if (phase === 'standing' && magnitude < DESCEND_THRESHOLD) {
    return 'descending';
  }
  if (phase === 'descending' && magnitude > RISE_THRESHOLD) {
    return 'rising';
  }
  if (phase === 'rising' && magnitude < STANDING_THRESHOLD) {
    return 'counted';
  }
  return phase;
}

/**
 * スクワット動作を加速度センサーで検出するカスタムフック。
 *
 * 背景: 朝の起床確認タスクとして、寝ぼけたまま操作できないフィジカルチャレンジを提供する。
 * チェックボックスをタップするだけの従来タスクと違い、実際に体を動かす必要がある。
 *
 * @param enabled - true でセンサー購読を開始。false で停止（バッテリー節約）。
 * @param targetCount - 目標スクワット回数。達したら onComplete を呼ぶ。
 * @param onSquat - スクワット1回検出時のコールバック。
 * @param onComplete - 目標回数達成時のコールバック。
 */
export function useSquatDetector(
  enabled: boolean,
  targetCount: number,
  onSquat: () => void,
  onComplete: () => void,
) {
  const [count, setCount] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const phaseRef = useRef<SquatPhase>('standing');
  const lastSquatTimeRef = useRef(0);

  const countRef = useRef(count);
  countRef.current = count;

  const handleComplete = useCallback(onComplete, [onComplete]);
  const handleSquat = useCallback(onSquat, [onSquat]);

  useEffect(() => {
    if (!enabled) {
      setIsListening(false);
      return;
    }

    // 100ms 間隔でサンプリング。精度とバッテリーのバランス。
    Accelerometer.setUpdateInterval(100);

    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const result = nextPhase(phaseRef.current, magnitude);

      if (result === 'counted') {
        const now = Date.now();
        if (now - lastSquatTimeRef.current > DEBOUNCE_MS) {
          lastSquatTimeRef.current = now;
          const newCount = countRef.current + 1;
          setCount(newCount);
          handleSquat();
          if (newCount >= targetCount) {
            handleComplete();
          }
        }
        phaseRef.current = 'standing';
      } else {
        phaseRef.current = result;
      }
    });

    setIsListening(true);

    return () => {
      subscription.remove();
      setIsListening(false);
    };
  }, [enabled, targetCount, handleSquat, handleComplete]);

  const reset = useCallback(() => {
    setCount(0);
    phaseRef.current = 'standing';
    lastSquatTimeRef.current = 0;
  }, []);

  return { count, isListening, reset };
}
