import {
  GRADE_COLORS_MAP,
  GRADE_SYMBOLS,
  GRADE_UNDETERMINED_COLOR_VALUE,
  UNDETERMINED_SYMBOL,
} from '../constants/grade-symbols';
import type { DailyGrade } from '../types/daily-grade';

describe('GradeIcon symbols', () => {
  it('maps excellent to ◎', () => {
    expect(GRADE_SYMBOLS.excellent).toBe('\u25CE');
  });

  it('maps good to ○', () => {
    expect(GRADE_SYMBOLS.good).toBe('\u25CB');
  });

  it('maps fair to △', () => {
    expect(GRADE_SYMBOLS.fair).toBe('\u25B3');
  });

  it('maps poor to ×', () => {
    expect(GRADE_SYMBOLS.poor).toBe('\u00D7');
  });

  it('has a symbol for every DailyGrade value', () => {
    const grades: DailyGrade[] = ['excellent', 'good', 'fair', 'poor'];
    for (const grade of grades) {
      expect(GRADE_SYMBOLS[grade]).toBeDefined();
      expect(typeof GRADE_SYMBOLS[grade]).toBe('string');
      expect(GRADE_SYMBOLS[grade].length).toBeGreaterThan(0);
    }
  });

  it('has a unique symbol for each grade', () => {
    const symbols = Object.values(GRADE_SYMBOLS);
    const unique = new Set(symbols);
    expect(unique.size).toBe(symbols.length);
  });

  it('undetermined symbol is ・', () => {
    expect(UNDETERMINED_SYMBOL).toBe('\u30FB');
  });
});

describe('GradeIcon colors', () => {
  it('has a color for every DailyGrade value', () => {
    const grades: DailyGrade[] = ['excellent', 'good', 'fair', 'poor'];
    for (const grade of grades) {
      expect(GRADE_COLORS_MAP[grade]).toBeDefined();
      expect(typeof GRADE_COLORS_MAP[grade]).toBe('string');
    }
  });

  it('excellent uses primary color (#e94560)', () => {
    expect(GRADE_COLORS_MAP.excellent).toBe('#e94560');
  });

  it('undetermined color is grey', () => {
    expect(GRADE_UNDETERMINED_COLOR_VALUE).toBe('#9E9E9E');
  });
});
