import { useEffect, useState } from 'react';
import type { SleepSummary } from '../services/health';
import { getSleepSummary, initHealthKit } from '../services/health';
import { useSettingsStore } from '../stores/settings-store';
import { useWakeRecordStore } from '../stores/wake-record-store';
import type { WakeRecord } from '../types/wake-record';
import { getLogicalDateString } from '../utils/date';

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

  const dayBoundaryHour = useSettingsStore((s) => s.dayBoundaryHour);
  // WakeRecord.date は getLogicalDateString で保存されるため、同じ関数で変換して検索する。
  // formatDateString は dayBoundaryHour を無視するため、深夜帯にレコードが見つからない不具合があった。
  const dateStr = getLogicalDateString(date, dayBoundaryHour);
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
  //
  // healthKitWakeTime のみを更新し、diffMinutes と result は変更しない。
  // 理由: diffMinutes と result はアラーム解除時点のユーザーの実際の行動に基づく値。
  // HealthKit の睡眠推定起床時刻はセンサーベースの推定値であり、アラーム操作時刻と
  // 異なる場合がある（例: ユーザーが即座に解除しても、HealthKit が入眠中と判定）。
  // ユーザーの実際の操作を正として維持し、HealthKit データは参考値として別フィールドに保持する。
  useEffect(() => {
    if (sleep === null || record === undefined || record.healthKitWakeTime !== null) return;

    updateRecord(record.id, {
      healthKitWakeTime: sleep.wakeUpTime,
    });
  }, [sleep, record, updateRecord]);

  return { date: dateStr, sleep, record, loading };
}
