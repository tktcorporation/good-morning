import { getLogicalDate, getLogicalDateString } from '../utils/date';

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
