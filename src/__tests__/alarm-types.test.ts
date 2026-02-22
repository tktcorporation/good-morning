import type { AlarmTime, DayOfWeek } from '../types/alarm';
import {
  createAlarmId,
  createTodoId,
  formatRepeatDays,
  formatTime,
  getDayLabel,
} from '../types/alarm';

const mockT = (key: string): string => {
  const translations: Record<string, string> = {
    'repeat.once': 'Once',
    'repeat.everyDay': 'Every day',
    'repeat.weekdays': 'Weekdays',
    'repeat.weekends': 'Weekends',
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

describe('formatRepeatDays', () => {
  it('returns "Once" for empty days', () => {
    expect(formatRepeatDays([], mockT)).toBe('Once');
  });

  it('returns "Every day" for all 7 days', () => {
    const days: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
    expect(formatRepeatDays(days, mockT)).toBe('Every day');
  });

  it('returns "Weekdays" for Mon-Fri', () => {
    const days: DayOfWeek[] = [1, 2, 3, 4, 5];
    expect(formatRepeatDays(days, mockT)).toBe('Weekdays');
  });

  it('returns "Weekends" for Sat-Sun', () => {
    const days: DayOfWeek[] = [0, 6];
    expect(formatRepeatDays(days, mockT)).toBe('Weekends');
  });

  it('returns individual day labels for custom days', () => {
    const days: DayOfWeek[] = [1, 3, 5];
    expect(formatRepeatDays(days, mockT)).toBe('Mon, Wed, Fri');
  });
});

describe('createAlarmId', () => {
  it('generates unique IDs', () => {
    const id1 = createAlarmId();
    const id2 = createAlarmId();
    expect(id1).not.toBe(id2);
  });

  it('starts with "alarm_"', () => {
    const id = createAlarmId();
    expect(id.startsWith('alarm_')).toBe(true);
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
