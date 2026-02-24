import { useEffect, useState } from 'react';
import type { SleepSummary } from '../services/health';
import { getSleepSummary, isHealthKitInitialized } from '../services/health';
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

export function useDailySummary(date: Date): DailySummary {
  const [sleep, setSleep] = useState<SleepSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const dateStr = formatDateString(date);
  const records = useWakeRecordStore((s) => s.records);
  const healthKitEnabled = useSettingsStore((s) => s.healthKitEnabled);

  const record = records.find((r) => r.date === dateStr);

  useEffect(() => {
    if (!healthKitEnabled || !isHealthKitInitialized()) {
      setLoading(false);
      setSleep(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    getSleepSummary(date)
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
