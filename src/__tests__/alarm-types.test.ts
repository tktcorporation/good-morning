import type { AlarmTime } from '../types/alarm';
import { createTodoId, formatTime, getDayLabel } from '../types/alarm';

const mockT = (key: string): string => {
  const translations: Record<string, string> = {
    'dayLabelsShort.0': 'Sun',
    'dayLabelsShort.1': 'Mon',
    'dayLabelsShort.2': 'Tue',
    'dayLabelsShort.3': 'Wed',
    'dayLabelsShort.4': 'Thu',
    'dayLabelsShort.5': 'Fri',
    'dayLabelsShort.6': 'Sat',
  };
  return translations[key] ?? key;
};

describe('formatTime', () => {
  it('formats single-digit hours and minutes with leading zeros', () => {
    const time: AlarmTime = { hour: 7, minute: 5 };
    expect(formatTime(time)).toBe('07:05');
  });

  it('formats double-digit hours and minutes', () => {
    const time: AlarmTime = { hour: 14, minute: 30 };
    expect(formatTime(time)).toBe('14:30');
  });

  it('formats midnight', () => {
    const time: AlarmTime = { hour: 0, minute: 0 };
    expect(formatTime(time)).toBe('00:00');
  });

  it('formats 23:59', () => {
    const time: AlarmTime = { hour: 23, minute: 59 };
    expect(formatTime(time)).toBe('23:59');
  });
});

describe('getDayLabel', () => {
  it('returns translated day label', () => {
    expect(getDayLabel(0, mockT)).toBe('Sun');
    expect(getDayLabel(1, mockT)).toBe('Mon');
    expect(getDayLabel(6, mockT)).toBe('Sat');
  });
});

describe('createTodoId', () => {
  it('generates unique IDs', () => {
    const id1 = createTodoId();
    const id2 = createTodoId();
    expect(id1).not.toBe(id2);
  });

  it('starts with "todo_"', () => {
    const id = createTodoId();
    expect(id.startsWith('todo_')).toBe(true);
  });
});
