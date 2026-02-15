import type { AlarmTime, DayOfWeek } from '../types/alarm';
import { createAlarmId, createTodoId, formatRepeatDays, formatTime } from '../types/alarm';

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

describe('formatRepeatDays', () => {
  it('returns "Once" for empty days', () => {
    expect(formatRepeatDays([])).toBe('Once');
  });

  it('returns "Every day" for all 7 days', () => {
    const days: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
    expect(formatRepeatDays(days)).toBe('Every day');
  });

  it('returns "Weekdays" for Mon-Fri', () => {
    const days: DayOfWeek[] = [1, 2, 3, 4, 5];
    expect(formatRepeatDays(days)).toBe('Weekdays');
  });

  it('returns "Weekends" for Sat-Sun', () => {
    const days: DayOfWeek[] = [0, 6];
    expect(formatRepeatDays(days)).toBe('Weekends');
  });

  it('returns individual day labels for custom days', () => {
    const days: DayOfWeek[] = [1, 3, 5];
    expect(formatRepeatDays(days)).toBe('Mon, Wed, Fri');
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
