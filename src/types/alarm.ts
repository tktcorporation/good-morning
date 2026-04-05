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

/**
 * タスクの種類。
 * - checkbox: タップで完了する通常のチェックリスト項目
 * - squat: 加速度センサーでスクワットを検出し、規定回数こなすと完了になるチャレンジ
 *
 * 将来の拡張（歩数カウント、QRスキャン等）もここに追加する。
 */
export type TodoType = 'checkbox' | 'squat';

export interface TodoItem {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
  /** タスク種別。未設定（レガシーデータ）は 'checkbox' として扱う。 */
  readonly type?: TodoType;
  /** squat タスクの目標回数。type === 'squat' の場合のみ使用。デフォルト10回。 */
  readonly requiredCount?: number;
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
