export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DAY_KEYS: Readonly<Record<DayOfWeek, string>> = {
  0: '0',
  1: '1',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
} as const;

export function getDayLabel(day: DayOfWeek, t: (key: string) => string): string {
  return t(`dayLabelsShort.${DAY_KEYS[day]}`);
}

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

export function formatRepeatDays(days: readonly DayOfWeek[], t: (key: string) => string): string {
  if (days.length === 0) {
    return t('repeat.once');
  }
  if (days.length === 7) {
    return t('repeat.everyDay');
  }
  const weekdays: readonly DayOfWeek[] = [1, 2, 3, 4, 5];
  const weekend: readonly DayOfWeek[] = [0, 6];
  if (weekdays.every((d) => days.includes(d)) && !weekend.some((d) => days.includes(d))) {
    return t('repeat.weekdays');
  }
  if (weekend.every((d) => days.includes(d)) && !weekdays.some((d) => days.includes(d))) {
    return t('repeat.weekends');
  }
  return days.map((d) => getDayLabel(d, t)).join(', ');
}
