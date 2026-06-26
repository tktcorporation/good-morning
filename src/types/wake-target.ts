import { formatLocalDate } from '../utils/date';
import type { AlarmTime, DayOfWeek, TodoItem } from './alarm';

/**
 * 固定スクワットタスクの仕様。
 *
 * 背景: ユーザーが起床タスクを自分で組み立てるのは認知負荷が高いというフィードバックを受け、
 * 「考えなくても始められる」ように起床タスクを「スクワット 10 回」1 件に固定した。
 * このため自由入力 / 追加 / 削除 / 並べ替えの UI と store API は廃止済み。
 *
 * `WakeTarget.todos` 配列の構造自体は維持している（MorningSession / Live Activity /
 * SquatChallengeItem など配列前提のロジックが多いため）。常に「この固定 TODO 1 件のみ」が
 * 入る不変条件を `DEFAULT_WAKE_TARGET` と `migrateStoredTarget` で担保する。
 */
export const FIXED_SQUAT_TODO_TITLE = 'Squat';
export const FIXED_SQUAT_REQUIRED_COUNT = 10;

/**
 * 固定 TODO の ID は決定論的な値にする。
 * 毎ロード時に乱数 ID を再生成すると、進行中の MorningSession 側 SessionTodo と
 * 同一視できなくなり、Live Activity 更新 / 完了処理が壊れる。
 */
export const FIXED_SQUAT_TODO_ID = 'fixed-squat-todo';

export function buildFixedSquatTodo(): TodoItem {
  return {
    id: FIXED_SQUAT_TODO_ID,
    title: FIXED_SQUAT_TODO_TITLE,
    completed: false,
    type: 'squat',
    requiredCount: FIXED_SQUAT_REQUIRED_COUNT,
  };
}

/**
 * 永続化済みの todos が固定スクワット TODO 1 件のみで構成されているかを判定する。
 * `migrateStoredTarget` で「正規化が必要か」のショートサーキット用。
 */
export function isFixedSquatTodoList(todos: readonly TodoItem[]): boolean {
  if (todos.length !== 1) return false;
  const only = todos[0];
  return (
    only !== undefined &&
    only.id === FIXED_SQUAT_TODO_ID &&
    only.type === 'squat' &&
    only.requiredCount === FIXED_SQUAT_REQUIRED_COUNT
  );
}

export type DayOverride =
  | { readonly type: 'custom'; readonly time: AlarmTime }
  | { readonly type: 'off' };

/**
 * 「明日だけ」のアラーム時刻オーバーライド。
 * targetDate を過ぎたら自動的にクリアされる（loadTarget 時に判定）。
 */
export interface NextOverride {
  readonly time: AlarmTime;
  /** オーバーライド対象日 (YYYY-MM-DD)。この日の time を過ぎたら期限切れとみなす。 */
  readonly targetDate: string;
}

export interface WakeTarget {
  readonly defaultTime: AlarmTime;
  readonly dayOverrides: Partial<Readonly<Record<DayOfWeek, DayOverride>>>;
  readonly nextOverride: NextOverride | null;
  readonly todos: readonly TodoItem[];
  readonly enabled: boolean;
  /**
   * 目標睡眠時間（分）。Daily Grade System で夜の評価に使用。
   * null = 未設定（夜の判定は常に noData → 最大 good まで）。
   * excellent を取るには HealthKit 連携 + この値の設定が必要。
   * 就寝目標時刻は calculateBedtime(defaultTime, targetSleepMinutes) で算出。
   */
  readonly targetSleepMinutes: number | null;
  /**
   * 起床目標バッファ（分）。アラーム時刻からこの分数後が「起床目標時刻」になる。
   * この時刻までに全TODOを完了すれば「起きられた」判定（morningPass）となる。
   *
   * 背景: アラームを止めただけでは起床とみなさず、朝ルーティン（TODO）を
   * 一定時間内に完了できたかどうかで起床成功を判定する。
   * デフォルト30分は「アラーム後に顔を洗って身支度する一般的な所要時間」として設定。
   */
  readonly wakeUpGoalBufferMinutes: number;
}

/**
 * Resolve the alarm time for a given date.
 * Priority: nextOverride > dayOverride > defaultTime.
 * Returns null if the day is set to OFF.
 */
export function resolveTimeForDate(target: WakeTarget, date: Date): AlarmTime | null {
  if (target.nextOverride !== null) {
    return target.nextOverride.time;
  }

  const dayOfWeek = date.getDay() as DayOfWeek;
  const override = target.dayOverrides[dayOfWeek];

  if (override !== undefined) {
    if (override.type === 'off') {
      return null;
    }
    return override.time;
  }

  return target.defaultTime;
}

/**
 * nextOverride が期限切れかどうかを判定する。
 * targetDate が存在しない（レガシーデータ）場合も期限切れとみなす。
 */
export function isNextOverrideExpired(override: NextOverride, now: Date = new Date()): boolean {
  if (override.targetDate === undefined || override.targetDate === '') {
    return true;
  }
  const [year, month, day] = override.targetDate.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return true;

  const expiresAt = new Date(year, month - 1, day, override.time.hour, override.time.minute, 0);
  return now.getTime() > expiresAt.getTime();
}

/**
 * setNextOverride 用: 現在時刻からオーバーライド対象日を算出する。
 * scheduleWakeTargetAlarm と同じロジック — 時刻が今日を過ぎていれば明日、そうでなければ今日。
 */
export function computeOverrideTargetDate(time: AlarmTime, now: Date = new Date()): string {
  const alarmDate = new Date(now);
  alarmDate.setHours(time.hour, time.minute, 0, 0);
  if (alarmDate.getTime() <= now.getTime()) {
    alarmDate.setDate(alarmDate.getDate() + 1);
  }
  return formatLocalDate(alarmDate);
}

/** デフォルトの起床目標バッファ（分）。アラーム後30分以内にTODO完了で成功。 */
export const DEFAULT_WAKE_UP_GOAL_BUFFER_MINUTES = 30;

export const DEFAULT_WAKE_TARGET: WakeTarget = {
  defaultTime: { hour: 7, minute: 0 },
  dayOverrides: {},
  nextOverride: null,
  // 起床タスクは「スクワット 10 回」固定。詳細は FIXED_SQUAT_TODO_ID のコメント参照。
  todos: [buildFixedSquatTodo()],
  enabled: true,
  targetSleepMinutes: null,
  wakeUpGoalBufferMinutes: DEFAULT_WAKE_UP_GOAL_BUFFER_MINUTES,
};
