import { useEffect, useState } from 'react';
import type { SleepSummary } from '../services/health';
import { getSleepSummary, initHealthKit } from '../services/health';
import { useSettingsStore } from '../stores/settings-store';
import { useWakeRecordStore } from '../stores/wake-record-store';
import type { WakeRecord } from '../types/wake-record';
import { calculateDiffMinutes, calculateWakeResult, formatDateString } from '../types/wake-record';

export interface DailySummary {
  readonly date: string;
  readonly sleep: SleepSummary | null;
  readonly record: WakeRecord | undefined;
  readonly loading: boolean;
}

/**
 * HealthKit の SleepSummary と WakeRecord を統合して返す hook。
 *
 * 背景: healthKitEnabled は AsyncStorage に永続化されるが、HealthKit の
 * initialized 状態はモジュールスコープの変数でアプリ再起動時にリセットされる。
 * そのため、healthKitEnabled=true かつ未初期化の場合は自動で再初期化を行い、
 * アプリ再起動後もシームレスに睡眠データを表示する。
 *
 * また、HealthKit の睡眠データが取得できた場合、対応する WakeRecord の
 * healthKitWakeTime が未設定なら自動で同期する。これにより、アラーム解除時に
 * データが未同期でも、次にアプリを開いた時点で WakeRecord が更新される。
 */
export function useDailySummary(date: Date): DailySummary {
  const [sleep, setSleep] = useState<SleepSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const dateStr = formatDateString(date);
  const records = useWakeRecordStore((s) => s.records);
  const updateRecord = useWakeRecordStore((s) => s.updateRecord);
  const healthKitEnabled = useSettingsStore((s) => s.healthKitEnabled);

  const record = records.find((r) => r.date === dateStr);

  useEffect(() => {
    if (!healthKitEnabled) {
      setLoading(false);
      setSleep(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    // @kingstinct/react-native-healthkit は明示的な初期化が不要。
    // requestAuthorization を呼べば権限リクエスト完了（既に許可済みなら即成功）。
    const fetchSleep = async (): Promise<SleepSummary | null> => {
      const ok = await initHealthKit();
      if (!ok) return null;
      return getSleepSummary(date);
    };

    fetchSleep()
      .then((summary) => {
        if (!cancelled) setSleep(summary);
      })
      .catch(() => {
        if (!cancelled) setSleep(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [date, healthKitEnabled]);

  // HealthKit の睡眠データと WakeRecord を自動同期する。
  // アプリを開くたびに useDailySummary が実行されるため、
  // ここで同期すれば特定のタイミング（解除時・TODO完了時）に限定する必要がない。
  useEffect(() => {
    if (sleep === null || record === undefined || record.healthKitWakeTime !== null) return;

    const hkWakeTime = new Date(sleep.wakeUpTime);
    const hkDiffMinutes = calculateDiffMinutes(record.targetTime, hkWakeTime);
    const hkResult = calculateWakeResult(hkDiffMinutes);

    updateRecord(record.id, {
      healthKitWakeTime: sleep.wakeUpTime,
      diffMinutes: hkDiffMinutes,
      result: hkResult,
    });
  }, [sleep, record, updateRecord]);

  return { date: dateStr, sleep, record, loading };
}
