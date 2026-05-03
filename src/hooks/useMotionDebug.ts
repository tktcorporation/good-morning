import { Accelerometer, Barometer, Gyroscope, Magnetometer, Pedometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { nextSquatPhase, type SquatPhase } from './useSquatDetector';

/**
 * デバッグ画面（app/squat-check.tsx）でリアルタイムにモーション情報を可視化するためのフック。
 *
 * 背景: スクワット検出の感度や閾値を調整したい場合、また「他にどんな動きが取れそうか」を
 * 把握したい場合のために、端末で取得できるモーション関連データをまとめて返す。
 * 本番フロー（useSquatDetector）とは別に独立購読しており、本番ロジックには影響しない。
 *
 * 各センサーは利用不可（シミュレータ・対応していない端末）の場合は null を返す。
 * Pedometer は権限要求が必要なため `permissionGranted` で結果を表す。
 *
 * NOTE: このフックは毎サンプル setState を呼ぶため再描画コストが高い。
 * デバッグ画面以外では絶対に使わないこと（本番では useSquatDetector を使う）。
 *
 * @param enabled - false 時は購読しない（画面遷移後のリーク防止）
 */
export interface MotionDebugSample {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface AccelerometerDebugSample extends MotionDebugSample {
  readonly magnitude: number;
}

export interface BarometerDebugSample {
  /** hPa */
  readonly pressure: number;
  /** 海抜からの相対高度 (m)。iOS のみ取得可能。 */
  readonly relativeAltitude: number | null;
}

export type SensorAvailability = 'unknown' | 'available' | 'unavailable';

export interface PedometerDebugState {
  /** Pedometer ハードウェアが端末で利用可能か */
  readonly availability: SensorAvailability;
  /** モーション権限の状態。null = 未要求 */
  readonly permissionGranted: boolean | null;
  /** 監視開始からカウントしている歩数 */
  readonly stepsSinceWatchStart: number;
  /** 今日 0:00 から現在までの累計歩数（HealthKit 由来） */
  readonly stepsToday: number | null;
  /** Pedometer 利用時のエラーメッセージ */
  readonly error: string | null;
}

export interface MotionDebugState {
  readonly accelerometer: AccelerometerDebugSample | null;
  readonly accelerometerAvailable: SensorAvailability;
  readonly gyroscope: MotionDebugSample | null;
  readonly gyroscopeAvailable: SensorAvailability;
  readonly magnetometer: MotionDebugSample | null;
  readonly magnetometerAvailable: SensorAvailability;
  readonly barometer: BarometerDebugSample | null;
  readonly barometerAvailable: SensorAvailability;
  readonly pedometer: PedometerDebugState;
  /** スクワット判定のステートマシン現在状態（リアルタイム） */
  readonly squatPhase: SquatPhase;
  /** 直近に観測された magnitude のうちの極小値（しゃがみ深さの目安） */
  readonly minMagnitude: number | null;
  /** 直近に観測された magnitude の極大値（立ち上がり強度の目安） */
  readonly maxMagnitude: number | null;
}

/**
 * デバッグ画面のサンプリング間隔。100ms は本番の useSquatDetector と同じ値。
 * これより短くしてもセンサー側の上限に当たるため意味がない。
 */
const SAMPLE_INTERVAL_MS = 100;

/**
 * Pedometer の今日の歩数を取得する。前回計算からの差分が大きい場合に再取得を呼ばれる。
 * シミュレータでは isAvailableAsync が true でも getStepCountAsync が失敗するため try/catch。
 */
async function fetchTodaySteps(): Promise<number | null> {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    const result = await Pedometer.getStepCountAsync(start, end);
    return result.steps;
  } catch {
    return null;
  }
}

/**
 * 単純センサー（Accelerometer/Gyroscope/Magnetometer/Barometer）の購読共通処理。
 *
 * 各センサーで try/catch・isAvailable・setUpdateInterval・addListener を繰り返し書くと
 * 認知的複雑度が高くなるため、共通フローをここに集約している。Pedometer は API が
 * 異なる（権限要求や watchStepCount）ため対象外。
 *
 * @returns 購読 subscription（unsubscribe 用）。利用不可・例外時は null。
 */
interface SimpleSensor<T> {
  isAvailableAsync(): Promise<boolean>;
  setUpdateInterval(ms: number): void;
  addListener(cb: (e: T) => void): { remove(): void };
}

async function subscribeSimpleSensor<T>(
  sensor: SimpleSensor<T>,
  intervalMs: number,
  setAvailability: (a: SensorAvailability) => void,
  onSample: (e: T) => void,
  isCancelled: () => boolean,
): Promise<{ remove(): void } | null> {
  try {
    const ok = await sensor.isAvailableAsync();
    if (isCancelled()) return null;
    setAvailability(ok ? 'available' : 'unavailable');
    if (!ok) return null;
    sensor.setUpdateInterval(intervalMs);
    return sensor.addListener(onSample);
  } catch {
    if (!isCancelled()) setAvailability('unavailable');
    return null;
  }
}

/**
 * Barometer サンプルを内部表現に変換する純粋関数。
 *
 * relativeAltitude は iOS のみで返ってくる optional プロパティ。
 * `'relativeAltitude' in data` でランタイム検出してから number 化する。
 */
function buildBarometerSample(data: {
  readonly pressure: number;
  readonly relativeAltitude?: number;
}): BarometerDebugSample {
  return {
    pressure: data.pressure,
    relativeAltitude: typeof data.relativeAltitude === 'number' ? data.relativeAltitude : null,
  };
}

/**
 * Accelerometer のサンプル毎に呼び出す純粋ステート遷移計算。
 *
 * setupAccelerometer 内に書くと cognitive complexity が高くなりすぎる
 * （リスナーは I/O 副作用 + ステートマシン更新 + min/max 計算が混ざる）ため、
 * 「次にどう状態を変えるか」だけを返すロジックをここに切り出している。
 * `null` を返すフィールドは「変化なし → setState 不要」を意味する。
 */
function computeAccelerometerUpdate(
  prevPhase: SquatPhase,
  prevMin: number | null,
  prevMax: number | null,
  magnitude: number,
): {
  readonly nextPhase: SquatPhase | null;
  readonly nextMin: number | null;
  readonly nextMax: number | null;
} {
  const phaseResult = nextSquatPhase(prevPhase, magnitude);
  const phaseAfterCount = phaseResult === 'counted' ? 'standing' : phaseResult;
  return {
    nextPhase: phaseAfterCount === prevPhase ? null : phaseAfterCount,
    nextMin: prevMin === null || magnitude < prevMin ? magnitude : null,
    nextMax: prevMax === null || magnitude > prevMax ? magnitude : null,
  };
}

export function useMotionDebug(enabled: boolean): MotionDebugState {
  const [accelerometer, setAccelerometer] = useState<AccelerometerDebugSample | null>(null);
  const [accelerometerAvailable, setAccelerometerAvailable] =
    useState<SensorAvailability>('unknown');
  const [gyroscope, setGyroscope] = useState<MotionDebugSample | null>(null);
  const [gyroscopeAvailable, setGyroscopeAvailable] = useState<SensorAvailability>('unknown');
  const [magnetometer, setMagnetometer] = useState<MotionDebugSample | null>(null);
  const [magnetometerAvailable, setMagnetometerAvailable] = useState<SensorAvailability>('unknown');
  const [barometer, setBarometer] = useState<BarometerDebugSample | null>(null);
  const [barometerAvailable, setBarometerAvailable] = useState<SensorAvailability>('unknown');
  const [pedometer, setPedometer] = useState<PedometerDebugState>({
    availability: 'unknown',
    permissionGranted: null,
    stepsSinceWatchStart: 0,
    stepsToday: null,
    error: null,
  });
  const [squatPhase, setSquatPhase] = useState<SquatPhase>('standing');
  const [minMagnitude, setMinMagnitude] = useState<number | null>(null);
  const [maxMagnitude, setMaxMagnitude] = useState<number | null>(null);

  // フェーズはサンプル毎に参照するため ref に保持して再描画を抑える
  const phaseRef = useRef<SquatPhase>('standing');
  const minRef = useRef<number | null>(null);
  const maxRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const subscriptions: Array<{ remove: () => void }> = [];

    const handleAccelerometerSample = ({ x, y, z }: { x: number; y: number; z: number }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      setAccelerometer({ x, y, z, magnitude });

      const update = computeAccelerometerUpdate(
        phaseRef.current,
        minRef.current,
        maxRef.current,
        magnitude,
      );
      if (update.nextPhase !== null) {
        phaseRef.current = update.nextPhase;
        setSquatPhase(update.nextPhase);
      }
      if (update.nextMin !== null) {
        minRef.current = update.nextMin;
        setMinMagnitude(update.nextMin);
      }
      if (update.nextMax !== null) {
        maxRef.current = update.nextMax;
        setMaxMagnitude(update.nextMax);
      }
    };

    const isCancelled = () => cancelled;

    const setupAll = async () => {
      const [accelSub, gyroSub, magSub, baroSub] = await Promise.all([
        subscribeSimpleSensor(
          Accelerometer,
          SAMPLE_INTERVAL_MS,
          setAccelerometerAvailable,
          handleAccelerometerSample,
          isCancelled,
        ),
        subscribeSimpleSensor(
          Gyroscope,
          SAMPLE_INTERVAL_MS,
          setGyroscopeAvailable,
          setGyroscope,
          isCancelled,
        ),
        subscribeSimpleSensor(
          Magnetometer,
          SAMPLE_INTERVAL_MS,
          setMagnetometerAvailable,
          setMagnetometer,
          isCancelled,
        ),
        // 気圧変化は緩やかなので 500ms で十分
        subscribeSimpleSensor(
          Barometer,
          500,
          setBarometerAvailable,
          (data) => setBarometer(buildBarometerSample(data)),
          isCancelled,
        ),
      ]);
      for (const sub of [accelSub, gyroSub, magSub, baroSub]) {
        if (sub !== null) subscriptions.push(sub);
      }
    };

    const startPedometerWatch = async () => {
      // 今日の累計歩数（HealthKit 由来）。失敗しても致命的ではない
      const today = await fetchTodaySteps();
      if (cancelled) return;
      setPedometer((p) => ({ ...p, stepsToday: today }));

      subscriptions.push(
        Pedometer.watchStepCount((result) => {
          setPedometer((p) => ({ ...p, stepsSinceWatchStart: result.steps }));
        }),
      );
    };

    /**
     * Pedometer の権限要求 → 状態反映 → watch 開始までの 1 連の処理。
     * 利用可能な前提で呼ばれる（呼び出し元で isAvailableAsync 済み）。
     */
    const requestAndStartPedometer = async () => {
      const perm = await Pedometer.requestPermissionsAsync();
      if (cancelled) return;
      setPedometer((p) => ({
        ...p,
        availability: 'available',
        permissionGranted: perm.granted,
      }));
      if (perm.granted) await startPedometerWatch();
    };

    const setupPedometer = async () => {
      try {
        const available = await Pedometer.isAvailableAsync();
        if (cancelled) return;
        if (!available) {
          setPedometer((p) => ({ ...p, availability: 'unavailable' }));
          return;
        }
        await requestAndStartPedometer();
      } catch (e) {
        if (cancelled) return;
        setPedometer((p) => ({
          ...p,
          availability: 'unavailable',
          error: e instanceof Error ? e.message : String(e),
        }));
      }
    };

    void setupAll();
    void setupPedometer();

    return () => {
      cancelled = true;
      for (const sub of subscriptions) sub.remove();
    };
  }, [enabled]);

  return {
    accelerometer,
    accelerometerAvailable,
    gyroscope,
    gyroscopeAvailable,
    magnetometer,
    magnetometerAvailable,
    barometer,
    barometerAvailable,
    pedometer,
    squatPhase,
    minMagnitude,
    maxMagnitude,
  };
}
