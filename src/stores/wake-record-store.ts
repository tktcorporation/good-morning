import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { WakeRecord, WakeResult, WakeStats } from '../types/wake-record';
import { createWakeRecordId } from '../types/wake-record';

const STORAGE_KEY = 'wake-records';

interface WakeRecordState {
  readonly records: readonly WakeRecord[];
  readonly loaded: boolean;
  loadRecords: () => Promise<void>;
  addRecord: (data: Omit<WakeRecord, 'id'>) => Promise<WakeRecord>;
  getRecordsForPeriod: (start: Date, end: Date) => readonly WakeRecord[];
  getWeekStats: (weekStart: Date) => WakeStats;
  getCurrentStreak: () => number;
}

async function persistRecords(records: readonly WakeRecord[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function isSuccessResult(result: WakeResult): boolean {
  return result === 'great' || result === 'ok';
}

export const useWakeRecordStore = create<WakeRecordState>((set, get) => ({
  records: [],
  loaded: false,

  loadRecords: async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed: readonly WakeRecord[] = JSON.parse(raw) as readonly WakeRecord[];
      set({ records: parsed, loaded: true });
    } else {
      set({ loaded: true });
    }
  },

  addRecord: async (data: Omit<WakeRecord, 'id'>): Promise<WakeRecord> => {
    const record: WakeRecord = {
      id: createWakeRecordId(),
      ...data,
    };

    const updated = [...get().records, record];
    set({ records: updated });
    await persistRecords(updated);
    return record;
  },

  getRecordsForPeriod: (start: Date, end: Date): readonly WakeRecord[] => {
    const startStr = formatDateString(start);
    const endStr = formatDateString(end);
    return get().records.filter((r) => r.date >= startStr && r.date <= endStr);
  },

  getWeekStats: (weekStart: Date): WakeStats => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const startStr = formatDateString(weekStart);
    const endStr = formatDateString(weekEnd);
    const periodRecords = get().records.filter((r) => r.date >= startStr && r.date <= endStr);

    const totalRecords = periodRecords.length;

    if (totalRecords === 0) {
      return {
        successRate: 0,
        averageDiffMinutes: 0,
        currentStreak: 0,
        longestStreak: 0,
        totalRecords: 0,
        resultCounts: { great: 0, ok: 0, late: 0, missed: 0 },
      };
    }

    const resultCounts: Record<WakeResult, number> = { great: 0, ok: 0, late: 0, missed: 0 };
    let totalDiff = 0;

    for (const record of periodRecords) {
      resultCounts[record.result] += 1;
      totalDiff += record.diffMinutes;
    }

    const successCount = resultCounts.great + resultCounts.ok;
    const successRate = (successCount / totalRecords) * 100;
    const averageDiffMinutes = totalDiff / totalRecords;

    // Calculate streaks within the period
    const sorted = [...periodRecords].sort((a, b) => a.date.localeCompare(b.date));
    let currentStreak = 0;
    let longestStreak = 0;
    let streak = 0;

    for (const record of sorted) {
      if (isSuccessResult(record.result)) {
        streak += 1;
        if (streak > longestStreak) {
          longestStreak = streak;
        }
      } else {
        streak = 0;
      }
    }
    currentStreak = streak;

    return {
      successRate: Math.round(successRate * 10) / 10,
      averageDiffMinutes,
      currentStreak,
      longestStreak,
      totalRecords,
      resultCounts,
    };
  },

  getCurrentStreak: (): number => {
    const { records } = get();
    if (records.length === 0) return 0;

    const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
    let streak = 0;

    for (const record of sorted) {
      if (isSuccessResult(record.result)) {
        streak += 1;
      } else {
        break;
      }
    }

    return streak;
  },
}));

function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type { WakeRecordState };
