import type { AlarmTime } from './alarm';

export type WakeResult = 'great' | 'ok' | 'late' | 'missed';

export interface WakeTodoRecord {
  readonly id: string;
  readonly title: string;
  readonly completedAt: string | null;
  readonly orderCompleted: number | null;
}

export interface WakeRecord {
  readonly id: string;
  readonly alarmId: string;
  readonly date: string; // YYYY-MM-DD

  readonly targetTime: AlarmTime;
  readonly alarmTriggeredAt: string; // ISO datetime
  readonly dismissedAt: string; // ISO datetime
  readonly healthKitWakeTime: string | null; // ISO datetime (Phase 3)

  readonly result: WakeResult;
  readonly diffMinutes: number; // positive = late, negative = early

  readonly todos: readonly WakeTodoRecord[];
  readonly todoCompletionSeconds: number;
  readonly alarmLabel: string;
}

export interface WakeStats {
  readonly successRate: number; // 0-100
  readonly averageDiffMinutes: number;
  readonly currentStreak: number;
  readonly longestStreak: number;
  readonly totalRecords: number;
  readonly resultCounts: Record<WakeResult, number>;
}

export function createWakeRecordId(): string {
  return `wake_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function calculateWakeResult(diffMinutes: number): WakeResult {
  if (diffMinutes <= 5) return 'great';
  if (diffMinutes <= 15) return 'ok';
  return 'late';
}

export function calculateDiffMinutes(
  targetTime: AlarmTime,
  actualTime: Date,
): number {
  const targetMinutes = targetTime.hour * 60 + targetTime.minute;
  const actualMinutes = actualTime.getHours() * 60 + actualTime.getMinutes();
  return actualMinutes - targetMinutes;
}
