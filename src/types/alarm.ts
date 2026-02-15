export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DAY_LABELS: Readonly<Record<DayOfWeek, string>> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
} as const;

export interface TodoItem {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}

export interface AlarmTime {
  readonly hour: number;
  readonly minute: number;
}

export interface Alarm {
  readonly id: string;
  readonly time: AlarmTime;
  readonly enabled: boolean;
  readonly label: string;
  readonly todos: readonly TodoItem[];
  readonly repeatDays: readonly DayOfWeek[];
  readonly notificationIds: readonly string[];
}

export interface AlarmFormData {
  readonly time: AlarmTime;
  readonly label: string;
  readonly todos: readonly TodoItem[];
  readonly repeatDays: readonly DayOfWeek[];
}

export function createAlarmId(): string {
  return `alarm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createTodoId(): string {
  return `todo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function formatTime(time: AlarmTime): string {
  const h = time.hour.toString().padStart(2, '0');
  const m = time.minute.toString().padStart(2, '0');
  return `${h}:${m}`;
}

export function formatRepeatDays(days: readonly DayOfWeek[]): string {
  if (days.length === 0) {
    return 'Once';
  }
  if (days.length === 7) {
    return 'Every day';
  }
  const weekdays: readonly DayOfWeek[] = [1, 2, 3, 4, 5];
  const weekend: readonly DayOfWeek[] = [0, 6];
  if (weekdays.every((d) => days.includes(d)) && !weekend.some((d) => days.includes(d))) {
    return 'Weekdays';
  }
  if (weekend.every((d) => days.includes(d)) && !weekdays.some((d) => days.includes(d))) {
    return 'Weekends';
  }
  return days.map((d) => DAY_LABELS[d]).join(', ');
}
