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
