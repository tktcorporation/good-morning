import { resolveTimeForDate, type WakeTarget } from '../types/wake-target';

describe('resolveTimeForDate', () => {
  const baseTarget: WakeTarget = {
    defaultTime: { hour: 7, minute: 0 },
    dayOverrides: {},
    nextOverride: null,
    todos: [],
    enabled: true,
  };

  test('returns defaultTime when no overrides', () => {
    // Wednesday 2026-02-25
    const date = new Date('2026-02-25T00:00:00');
    expect(resolveTimeForDate(baseTarget, date)).toEqual({ hour: 7, minute: 0 });
  });

  test('returns dayOverride custom time when set for that weekday', () => {
    const target: WakeTarget = {
      ...baseTarget,
      dayOverrides: { 3: { type: 'custom', time: { hour: 6, minute: 30 } } },
    };
    // Wednesday = DayOfWeek 3
    const date = new Date('2026-02-25T00:00:00');
    expect(resolveTimeForDate(target, date)).toEqual({ hour: 6, minute: 30 });
  });

  test('returns null when dayOverride is off', () => {
    const target: WakeTarget = {
      ...baseTarget,
      dayOverrides: { 0: { type: 'off' } },
    };
    // Sunday = DayOfWeek 0
    const date = new Date('2026-02-22T00:00:00');
    expect(resolveTimeForDate(target, date)).toBeNull();
  });

  test('nextOverride takes priority over dayOverride', () => {
    const target: WakeTarget = {
      ...baseTarget,
      dayOverrides: { 3: { type: 'custom', time: { hour: 6, minute: 30 } } },
      nextOverride: { time: { hour: 5, minute: 0 } },
    };
    const date = new Date('2026-02-25T00:00:00');
    expect(resolveTimeForDate(target, date)).toEqual({ hour: 5, minute: 0 });
  });

  test('nextOverride takes priority over defaultTime', () => {
    const target: WakeTarget = {
      ...baseTarget,
      nextOverride: { time: { hour: 5, minute: 45 } },
    };
    const date = new Date('2026-02-25T00:00:00');
    expect(resolveTimeForDate(target, date)).toEqual({ hour: 5, minute: 45 });
  });
});
