import { HALF_DAY_MINUTES, MINUTES_PER_DAY, MS_PER_MINUTE } from '../constants/time';

/**
 * Date を端末ローカルタイムゾーンの YYYY-MM-DD 文字列に変換する。
 * UTC ベースの toISOString と違いローカルの暦日を返すため、
 * 「その日のレコード」をローカル日付で突き合わせる用途に使う。
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 分単位の時刻差を「より近い側」に畳む（深夜跨ぎ補正）。
 * 例: 目標 23:00、実際 0:30 は素朴に引くと -1350 分になるが、
 * +1440 して +90 分（90 分遅い）に補正する。結果は [-720, 720] に収まる。
 */
export function normalizeMinuteDiff(diffMinutes: number): number {
  if (diffMinutes > HALF_DAY_MINUTES) return diffMinutes - MINUTES_PER_DAY;
  if (diffMinutes < -HALF_DAY_MINUTES) return diffMinutes + MINUTES_PER_DAY;
  return diffMinutes;
}

/**
 * 今日から過去6日分 + 今日の計7日分の Date 配列を返す。
 * 常に直近の履歴が見えるため、曜日に関わらず過去データを表示できる。
 */
export function getRecentDates(baseDate: Date = new Date()): readonly Date[] {
  const dates: Date[] = [];
  for (let i = 6; i >= 0; i--) {
    dates.push(addDays(baseDate, -i));
  }
  return dates;
}

/**
 * 日付変更ラインを考慮した「論理的な日付」を返す。
 * dayBoundaryHour より前の時刻は前日として扱う。
 */
export function getLogicalDate(date: Date, dayBoundaryHour: number): Date {
  if (dayBoundaryHour === 0 || date.getHours() >= dayBoundaryHour) {
    return date;
  }
  return addDays(date, -1);
}

/**
 * 日付変更ラインを考慮した YYYY-MM-DD 文字列を返す。
 */
export function getLogicalDateString(date: Date, dayBoundaryHour: number): string {
  return formatLocalDate(getLogicalDate(date, dayBoundaryHour));
}

/**
 * 日付を指定日数だけシフトした新しい Date を返す（元の date は変更しない）。
 * days は負数で過去方向。年月をまたぐ場合も Date のロールオーバーに従う。
 *
 * `new Date(x); x.setDate(x.getDate() + n)` という「クローンしてから破壊的に
 * ずらす」定型が日付跨ぎ計算（override 対象日・週次集計・グレード確定走査等）に
 * 散在していたため、ここに集約する。
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * YYYY-MM-DD 形式の暦日文字列を、端末ローカルタイムゾーンの当日 00:00 の Date に変換する。
 * `new Date(dateStr)`（引数なしの YYYY-MM-DD）は UTC 解釈されるため、ローカル暦日で
 * 保存されたレコード（WakeRecord.date 等）と突き合わせる際は必ずこちらを使うこと。
 */
export function parseLocalDateString(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

/**
 * 2つの Date の差を分単位で返す（to - from）。負値は to が from より過去であることを表す。
 */
export function minutesBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_MINUTE;
}
