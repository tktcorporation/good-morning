import { useEffect, useState } from 'react';
import type { SleepSummary } from '../services/health';
import { getSleepSummary, initHealthKit, isHealthKitInitialized } from '../services/health';
import { useSettingsStore } from '../stores/settings-store';
import { useWakeRecordStore } from '../stores/wake-record-store';
import type { WakeRecord } from '../types/wake-record';
import { formatDateString } from '../types/wake-record';

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
 */
export function useDailySummary(date: Date): DailySummary {
  const [sleep, setSleep] = useState<SleepSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const dateStr = formatDateString(date);
  const records = useWakeRecordStore((s) => s.records);
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

    // アプリ再起動後は initialized=false にリセットされるため、
    // healthKitEnabled=true なら自動で再初期化してからデータ取得する。
    const fetchSleep = async (): Promise<SleepSummary | null> => {
      if (!isHealthKitInitialized()) {
        const ok = await initHealthKit();
        if (!ok) return null;
      }
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

  return { date: dateStr, sleep, record, loading };
}
