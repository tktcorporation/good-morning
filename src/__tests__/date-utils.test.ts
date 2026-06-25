import {
  formatLocalDate,
  getLogicalDate,
  getLogicalDateString,
  normalizeMinuteDiff,
} from '../utils/date';

describe('getLogicalDate', () => {
  test('returns same date when time is after boundary', () => {
    const date = new Date(2026, 1, 22, 10, 0);
    const result = getLogicalDate(date, 3);
    expect(result.getDate()).toBe(22);
  });

  test('returns previous date when time is before boundary', () => {
    const date = new Date(2026, 1, 22, 2, 0);
    const result = getLogicalDate(date, 3);
    expect(result.getDate()).toBe(21);
  });

  test('returns same date when time equals boundary', () => {
    const date = new Date(2026, 1, 22, 3, 0);
    const result = getLogicalDate(date, 3);
    expect(result.getDate()).toBe(22);
  });

  test('handles midnight boundary (0) — no adjustment', () => {
    const date = new Date(2026, 1, 22, 1, 0);
    const result = getLogicalDate(date, 0);
    expect(result.getDate()).toBe(22);
  });

  test('handles month boundary', () => {
    const date = new Date(2026, 2, 1, 1, 0);
    const result = getLogicalDate(date, 3);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(28);
  });
});

describe('getLogicalDateString', () => {
  test('returns YYYY-MM-DD of logical date', () => {
    const date = new Date(2026, 1, 22, 2, 0);
    expect(getLogicalDateString(date, 3)).toBe('2026-02-21');
  });

  test('returns same date string when after boundary', () => {
    const date = new Date(2026, 1, 22, 10, 0);
    expect(getLogicalDateString(date, 3)).toBe('2026-02-22');
  });
});

describe('formatLocalDate', () => {
  test('月・日をゼロ埋めした YYYY-MM-DD を返す', () => {
    expect(formatLocalDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  test('ローカル時刻ベース（UTC ではない）で暦日を返す', () => {
    // 1月末の深夜でも、その端末ローカルの暦日をそのまま返す。
    expect(formatLocalDate(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });
});

describe('normalizeMinuteDiff', () => {
  test('範囲内の差はそのまま返す', () => {
    expect(normalizeMinuteDiff(90)).toBe(90);
    expect(normalizeMinuteDiff(-90)).toBe(-90);
  });

  test('深夜跨ぎで負に振れた差を +1440 で畳む（目標23:00→実際0:30 = +90）', () => {
    expect(normalizeMinuteDiff(-1350)).toBe(90);
  });

  test('深夜跨ぎで正に振れた差を -1440 で畳む（目標0:30→実際23:00 = -90）', () => {
    expect(normalizeMinuteDiff(1350)).toBe(-90);
  });

  test('閾値 ±720 は畳まない（境界）', () => {
    expect(normalizeMinuteDiff(720)).toBe(720);
    expect(normalizeMinuteDiff(-720)).toBe(-720);
  });
});
