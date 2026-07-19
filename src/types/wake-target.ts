import { formatLocalDate, getLogicalDate } from '../utils/date';
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

/** nextOverride を考慮せず、dayOverrides/defaultTime だけでその日の時刻を解決する。 */
export function resolveRegularTimeForDate(target: WakeTarget, date: Date): AlarmTime | null {
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
 * Resolve the alarm time for a given date.
 * Priority: nextOverride > dayOverride > defaultTime.
 * Returns null if the day is set to OFF.
 *
 * nextOverride は targetDate の当日にのみ適用する。期限切れ override のクリアは
 * 通常起動時（clearExpiredOverride）にしか走らず数日残留しうるため、日付で
 * スコープしないと他の日のセッションウィンドウ・起床記録まで override 時刻に
 * 引きずられる。
 *
 * override 対象日は通常の繰り返しアラームも維持される設計（二重鳴動を許容）
 * のため、この関数は「その日どちらのアラームが実際に発火したか」を区別
 * できない。dismiss 処理（記録の作成）では resolveTimeForDismiss を使うこと。
 */
export function resolveTimeForDate(target: WakeTarget, date: Date): AlarmTime | null {
  if (target.nextOverride !== null && formatLocalDate(date) === target.nextOverride.targetDate) {
    return target.nextOverride.time;
  }
  return resolveRegularTimeForDate(target, date);
}

const toMinutes = (t: AlarmTime): number => t.hour * 60 + t.minute;

/**
 * dismiss 時点でまだ発火していない（未来の）候補は除外して2候補から選ぶ。
 *
 * override と通常アラームが時刻的に近接していると、絶対時刻差だけの比較では
 * 「まだ鳴っていない側」が dismiss 原因として選ばれてしまうことがある
 * （例: override 7:00・通常 7:10 で dismiss が 7:06 の場合、7:10 はまだ未来）。
 * dismiss は必ず発火済みのアラームに対して起きるため、発火済みの候補のみを
 * 比較対象にする。両方とも発火済み（または理論上両方未来という異常系）なら、
 * dismiss 時刻に近い方を採用する。
 */
function pickFiredDismissCandidate(
  a: AlarmTime,
  aMinutes: number,
  b: AlarmTime,
  bMinutes: number,
  dismissMinutes: number,
): AlarmTime {
  const aFired = aMinutes <= dismissMinutes;
  const bFired = bMinutes <= dismissMinutes;
  if (aFired !== bFired) return aFired ? a : b;
  const aDiff = Math.abs(dismissMinutes - aMinutes);
  const bDiff = Math.abs(dismissMinutes - bMinutes);
  return aDiff <= bDiff ? a : b;
}

/** resolveDismissCandidate の戻り値。dayOffset は dismissTime の暦日からの相対日数（0 か -1）。 */
interface DismissCandidate {
  readonly time: AlarmTime;
  readonly dayOffset: number;
}

/**
 * dismiss 時刻に基づいて、実際に発火したと思われるアラーム候補（時刻 + 発火日）を解決する。
 *
 * override 対象日は通常の繰り返しアラームも鳴り続ける設計のため、
 * 「対象日なら常に override」という単純な判定では、通常アラームが dismiss
 * された場合でも override 時刻を誤って採用し、WakeRecord の targetTime・
 * diffMinutes・result が不正確になる。dismissTime の時刻部分に近い方の候補を
 * 実際に鳴ったアラームとみなす。
 *
 * override が前日深夜（例: 23:50）に設定されている場合、実際に鳴った直後でも
 * dismiss が日付をまたいでから行われることがある。暦日一致だけで判定すると
 * 翌日（targetDate の翌日）の通常アラームに誤って解決してしまうため、前日
 * override との実経過時間も候補にする（この場合 dayOffset は -1 になる）。
 *
 * どちらのケースでも、まだ発火していない（dismissTime より未来の）候補は
 * pickFiredDismissCandidate / 発火チェックで除外する。dismiss は必ず発火済みの
 * アラームに対して起きるため、時刻が近いだけの未来の候補を誤採用しない。
 */
function resolveDismissCandidate(target: WakeTarget, dismissTime: Date): DismissCandidate | null {
  const regular = resolveRegularTimeForDate(target, dismissTime);
  const override = target.nextOverride;
  if (override === null) return regular === null ? null : { time: regular, dayOffset: 0 };

  const dismissMinutes = dismissTime.getHours() * 60 + dismissTime.getMinutes();

  if (formatLocalDate(dismissTime) === override.targetDate) {
    if (regular === null) return { time: override.time, dayOffset: 0 };
    const picked = pickFiredDismissCandidate(
      override.time,
      toMinutes(override.time),
      regular,
      toMinutes(regular),
      dismissMinutes,
    );
    return { time: picked, dayOffset: 0 };
  }

  const prevDay = new Date(dismissTime.getTime() - 24 * 60 * 60 * 1000);
  if (formatLocalDate(prevDay) === override.targetDate) {
    if (regular === null) return { time: override.time, dayOffset: -1 };
    const regularMinutes = toMinutes(regular);
    if (regularMinutes > dismissMinutes) return { time: override.time, dayOffset: -1 };

    const overrideMinutesUntilMidnight = 24 * 60 - toMinutes(override.time);
    const overrideElapsed = dismissMinutes + overrideMinutesUntilMidnight;
    const regularElapsed = dismissMinutes - regularMinutes;
    return overrideElapsed <= regularElapsed
      ? { time: override.time, dayOffset: -1 }
      : { time: regular, dayOffset: 0 };
  }

  return regular === null ? null : { time: regular, dayOffset: 0 };
}

/**
 * dismiss 時刻に基づいて、実際に発火したと思われるアラーム時刻を解決する。
 * 詳細な選定ロジックは resolveDismissCandidate を参照。
 */
export function resolveTimeForDismiss(target: WakeTarget, dismissTime: Date): AlarmTime | null {
  return resolveDismissCandidate(target, dismissTime)?.time ?? null;
}

/**
 * dismiss 時刻に基づいて、実際に発火したと思われるアラームの完全な日時を解決する。
 *
 * resolveTimeForDismiss は時刻（AlarmTime）のみを返すため、深夜またぎで前日の
 * override が採用された場合にその情報が失われる。goalDeadline のように
 * 「発火時刻 + バッファ分」を日付をまたいで計算する場面で
 * `dismissTime の暦日 + resolveTimeForDismiss の時刻` を組み合わせると、
 * 前日 23:50 発火のアラームが翌日基準で計算され、締め切りが 1 日ズレる。
 * この関数は resolveDismissCandidate の dayOffset を反映した正しい日付で
 * Date を組み立てる。
 */
export function resolveDismissInstant(target: WakeTarget, dismissTime: Date): Date | null {
  const candidate = resolveDismissCandidate(target, dismissTime);
  if (candidate === null) return null;
  const base = new Date(dismissTime.getTime() + candidate.dayOffset * 24 * 60 * 60 * 1000);
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    candidate.time.hour,
    candidate.time.minute,
    0,
  );
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
  // NaN を素通しすると比較が常に false になり「永遠に期限切れにならない」
  // override が残るため、パース不能な targetDate は期限切れとして掃除させる
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return true;
  }

  const expiresAt = new Date(year, month - 1, day, override.time.hour, override.time.minute, 0);
  return now.getTime() > expiresAt.getTime();
}

/**
 * setNextOverride 用: 「明日だけ変更」の対象日を算出する。
 *
 * UI（target-edit の tomorrowOnly）が指すのは「次に迎える朝 = 論理的な翌日」。
 * 暦日ではなく dayBoundaryHour で判定するのは、日付変更ライン前の深夜
 * （例: 0:30）に設定した場合、ユーザーの言う「明日」はこのあと数時間後に
 * 迎える今夜の起床（暦日では当日）を指すため。
 * 「時刻が未到来なら今日」にすると、朝 7:30 に設定した「明日だけ 8:00」が
 * 30 分後の当日 8:00 に鳴ってしまい、肝心の翌日には何も鳴らない。
 */
/**
 * 「明日だけ変更」ピッカーが指す論理的な翌日を返す。
 *
 * computeOverrideTargetDate と同じ基準（dayBoundaryHour 考慮の論理日 + 1日）で
 * 対象日を決める。target-edit のピッカー初期値がこの基準からズレると
 * （例えば暦日ベースの `new Date() + 1日` を使うと）、dayBoundaryHour より前の
 * 深夜に開いた場合、画面に表示される dayOverrides の曜日と実際に保存される
 * targetDate の曜日が食い違う。time 依存の先送り判定は含まない —
 * ここはピッカーに「次に迎える朝」の予定値を表示するためのものであり、
 * 実際の targetDate 確定は setNextOverride 側の computeOverrideTargetDate が行う。
 */
export function getNextLogicalDay(dayBoundaryHour: number, now: Date = new Date()): Date {
  const nextDay = new Date(getLogicalDate(now, dayBoundaryHour).getTime());
  nextDay.setDate(nextDay.getDate() + 1);
  return nextDay;
}

/** resolveNextAlarmCandidate の戻り値。date は time が属する暦日（ラベル表示等に使う）。 */
interface NextAlarmCandidate {
  readonly time: AlarmTime;
  readonly date: Date;
}

/**
 * 現在時刻を基準に、次に鳴る予定のアラーム候補（時刻 + 属する日付）を解決する。
 *
 * resolveTimeForDate(target, now) は「今日」の予定時刻を返すだけで、今日の
 * アラームが既に発火済み（現在時刻が過ぎている）かどうかは考慮しない。
 * ウィジェット等の「次のアラームはいつか」表示にそのまま使うと、今日の
 * アラームを消化した後も同じ時刻を表示し続け、翌日に予定された
 * nextOverride があってもそれが反映されない。
 */
function resolveNextAlarmCandidate(
  target: WakeTarget,
  now: Date,
  dayBoundaryHour: number,
): NextAlarmCandidate | null {
  const todayTime = resolveTimeForDate(target, now);
  if (todayTime !== null) {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const todayMinutes = todayTime.hour * 60 + todayTime.minute;
    if (todayMinutes > nowMinutes) {
      return { time: todayTime, date: now };
    }
  }
  const nextDay = getNextLogicalDay(dayBoundaryHour, now);
  const nextTime = resolveTimeForDate(target, nextDay);
  return nextTime === null ? null : { time: nextTime, date: nextDay };
}

/** 次に鳴る予定のアラーム時刻。詳細は resolveNextAlarmCandidate を参照。 */
export function resolveNextAlarmTime(
  target: WakeTarget,
  now: Date,
  dayBoundaryHour: number,
): AlarmTime | null {
  return resolveNextAlarmCandidate(target, now, dayBoundaryHour)?.time ?? null;
}

/**
 * 次に鳴る予定のアラームが属する日付。曜日ラベル表示など、時刻だけでなく
 * 日付（今日 or 翌日）も必要な場面で resolveNextAlarmTime と対で使う。
 */
export function resolveNextAlarmDate(
  target: WakeTarget,
  now: Date,
  dayBoundaryHour: number,
): Date | null {
  return resolveNextAlarmCandidate(target, now, dayBoundaryHour)?.date ?? null;
}

export function computeOverrideTargetDate(
  time: AlarmTime,
  dayBoundaryHour: number,
  now: Date = new Date(),
): string {
  // getLogicalDate は調整不要のとき引数と同一参照を返すため、now を壊さないよう複製する
  const alarmDate = new Date(getLogicalDate(now, dayBoundaryHour).getTime());
  alarmDate.setDate(alarmDate.getDate() + 1);
  alarmDate.setHours(time.hour, time.minute, 0, 0);
  // 論理翌日でも指定時刻が既に過去（深夜に翌 0 時台を指定等）なら、
  // 即座に期限切れ扱いになる無効な override を作らないよう 1 日先送りする
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
