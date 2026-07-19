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

/** resolveDismissCandidate の戻り値。dayOffset は dismissTime の暦日からの相対日数（0 か -1）。 */
interface DismissCandidate {
  readonly time: AlarmTime;
  readonly dayOffset: number;
}

/** DismissCandidate が実際に発火する絶対日時を計算する。 */
function toDismissInstant(dismissTime: Date, candidate: DismissCandidate): Date {
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
 * dismissTime を基準に、実際に発火した可能性のあるアラーム候補（当日・前日 ×
 * 通常・override）を列挙する。存在しない組み合わせ（override 対象日でない等）
 * は含めない。
 *
 * override 対象日は通常の繰り返しアラームも鳴り続ける設計（二重鳴動を許容）
 * のため、当日・前日それぞれで override と通常アラームの両方が候補になりうる。
 * 例えば通常 23:50（前日）・override 00:10（当日）という近接設定では、
 * 「当日候補（override・通常）」だけで判定すると両方ともまだ未来になって
 * しまい、実際に発火済みの前日 23:50 の通常アラームを見落とす。
 */
function collectDismissCandidates(
  target: WakeTarget,
  dismissTime: Date,
): readonly DismissCandidate[] {
  const candidates: DismissCandidate[] = [];
  const override = target.nextOverride;
  const prevDay = new Date(dismissTime.getTime() - 24 * 60 * 60 * 1000);

  const todayRegular = resolveRegularTimeForDate(target, dismissTime);
  if (todayRegular !== null) candidates.push({ time: todayRegular, dayOffset: 0 });

  const prevRegular = resolveRegularTimeForDate(target, prevDay);
  if (prevRegular !== null) candidates.push({ time: prevRegular, dayOffset: -1 });

  if (override !== null) {
    if (formatLocalDate(dismissTime) === override.targetDate) {
      candidates.push({ time: override.time, dayOffset: 0 });
    }
    if (formatLocalDate(prevDay) === override.targetDate) {
      candidates.push({ time: override.time, dayOffset: -1 });
    }
  }

  return candidates;
}

/**
 * dismiss 時刻に基づいて、実際に発火したと思われるアラーム候補（時刻 + 発火日）を解決する。
 *
 * collectDismissCandidates で列挙した候補のうち、dismissTime 時点で既に
 * 発火済み（候補の絶対日時 <= dismissTime）のものだけを対象に、dismissTime
 * に最も近いものを選ぶ。dismiss は必ず発火済みのアラームに対して起きるため、
 * 時刻が近いだけの未来の候補（例: override 7:00・通常 7:10 が近接し、
 * dismiss が 7:06 の場合の 7:10）を誤採用しない。
 * 理論上すべての候補が未来という異常系では、フォールバックとして全候補の
 * 中から dismissTime に最も近いものを返す。
 */
function resolveDismissCandidate(target: WakeTarget, dismissTime: Date): DismissCandidate | null {
  const candidates = collectDismissCandidates(target, dismissTime);
  if (candidates.length === 0) return null;

  const withInstant = candidates.map((candidate) => ({
    candidate,
    instant: toDismissInstant(dismissTime, candidate),
  }));
  const fired = withInstant.filter((c) => c.instant.getTime() <= dismissTime.getTime());
  const pool = fired.length > 0 ? fired : withInstant;

  return pool.reduce((closest, current) => {
    const closestDiff = Math.abs(dismissTime.getTime() - closest.instant.getTime());
    const currentDiff = Math.abs(dismissTime.getTime() - current.instant.getTime());
    return currentDiff < closestDiff ? current : closest;
  }).candidate;
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
  return candidate === null ? null : toDismissInstant(dismissTime, candidate);
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
 * override 対象日でも通常の繰り返しアラームは維持される設計（二重鳴動を許容）
 * のため、resolveTimeForDate（override 優先で1候補しか返さない）をそのまま
 * 「次のアラーム」に使うと、通常アラームがまだ発火していないのに override を
 * 誤って報告したり、override 発火後にまだ発火していない同日の通常アラームを
 * 見逃したりする。当日・翌日それぞれの通常アラーム・override 候補を列挙し、
 * その中から now より未来で最も早いものを選ぶ。
 *
 * dayBoundaryHour がアラーム時刻より後に設定されている場合、アラーム発火後
 * 〜境界通過前の時間帯は論理日がまだ前日のままのため、getNextLogicalDay
 * （論理日 + 1日）が「今日」に戻ってしまう。候補日が now の暦日と同じままなら
 * 実際に翌日になるまでさらに 1 日ずつ進める。
 *
 * dayOverrides は曜日（7種）単位の設定のため、翌日が OFF でもその次の曜日が
 * 有効なことがある。翌日だけを候補にすると、翌日が OFF の場合に候補が尽きて
 * 実際にはまだアクティブな繰り返しアラームを「次のアラームなし」と誤って
 * 報告してしまう。翌日以降 7 日分（週内の全曜日パターン）を候補にする。
 */
function resolveNextAlarmCandidate(
  target: WakeTarget,
  now: Date,
  dayBoundaryHour: number,
): NextAlarmCandidate | null {
  let nextDay = getNextLogicalDay(dayBoundaryHour, now);
  while (formatLocalDate(nextDay) === formatLocalDate(now)) {
    nextDay = new Date(nextDay.getTime() + 24 * 60 * 60 * 1000);
  }

  const dates = [now];
  let cursor = nextDay;
  for (let i = 0; i < 7; i++) {
    dates.push(cursor);
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  const override = target.nextOverride;
  const options: NextAlarmCandidate[] = [];
  for (const date of dates) {
    const regular = resolveRegularTimeForDate(target, date);
    if (regular !== null) options.push({ time: regular, date });
    if (override !== null && formatLocalDate(date) === override.targetDate) {
      options.push({ time: override.time, date });
    }
  }

  const upcoming = options
    .map((option) => ({
      option,
      instant: new Date(
        option.date.getFullYear(),
        option.date.getMonth(),
        option.date.getDate(),
        option.time.hour,
        option.time.minute,
        0,
      ),
    }))
    .filter((o) => o.instant.getTime() > now.getTime());
  if (upcoming.length === 0) return null;

  return upcoming.reduce((closest, current) =>
    current.instant.getTime() < closest.instant.getTime() ? current : closest,
  ).option;
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
