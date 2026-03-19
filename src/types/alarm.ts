export type TranslateFn = (key: string) => string;

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const DAY_KEYS: Readonly<Record<DayOfWeek, string>> = {
  0: '0',
  1: '1',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
} as const;

export function getDayLabel(day: DayOfWeek, t: TranslateFn): string {
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

export function createTodoId(): string {
  return `todo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function formatTime(time: AlarmTime): string {
  const h = time.hour.toString().padStart(2, '0');
  const m = time.minute.toString().padStart(2, '0');
  return `${h}:${m}`;
}
