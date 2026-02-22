/**
 * ISO datetime 文字列から HH:MM 形式にフォーマットする。
 */
export function formatIsoTime(isoString: string): string {
  const date = new Date(isoString);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * 指定日を含む週の月曜日〜日曜日の Date 配列を返す。
 */
export function getWeekDates(baseDate: Date = new Date()): readonly Date[] {
  const dayOfWeek = baseDate.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() + mondayOffset);

  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

/**
 * 今日から過去6日分 + 今日の計7日分の Date 配列を返す。
 * 常に直近の履歴が見えるため、曜日に関わらず過去データを表示できる。
 */
export function getRecentDates(baseDate: Date = new Date()): readonly Date[] {
  const dates: Date[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() - i);
    dates.push(d);
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
  const adjusted = new Date(date);
  adjusted.setDate(adjusted.getDate() - 1);
  return adjusted;
}

/**
 * 日付変更ラインを考慮した YYYY-MM-DD 文字列を返す。
 */
export function getLogicalDateString(date: Date, dayBoundaryHour: number): string {
  const logical = getLogicalDate(date, dayBoundaryHour);
  const year = logical.getFullYear();
  const month = (logical.getMonth() + 1).toString().padStart(2, '0');
  const day = logical.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}
