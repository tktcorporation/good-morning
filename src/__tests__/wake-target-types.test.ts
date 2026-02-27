import {
  computeOverrideTargetDate,
  isNextOverrideExpired,
  resolveTimeForDate,
  type WakeTarget,
} from '../types/wake-target';

describe('resolveTimeForDate', () => {
  const baseTarget: WakeTarget = {
    defaultTime: { hour: 7, minute: 0 },
    dayOverrides: {},
    nextOverride: null,
    todos: [],
    enabled: true,
    soundId: 'default',
    bedtimeTarget: null,
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
      nextOverride: { time: { hour: 5, minute: 0 }, targetDate: '2026-02-25' },
    };
    const date = new Date('2026-02-25T00:00:00');
    expect(resolveTimeForDate(target, date)).toEqual({ hour: 5, minute: 0 });
  });

  test('nextOverride takes priority over defaultTime', () => {
    const target: WakeTarget = {
      ...baseTarget,
      nextOverride: { time: { hour: 5, minute: 45 }, targetDate: '2026-02-25' },
    };
    const date = new Date('2026-02-25T00:00:00');
    expect(resolveTimeForDate(target, date)).toEqual({ hour: 5, minute: 45 });
  });
});

describe('isNextOverrideExpired', () => {
  test('returns true when targetDate + time is in the past', () => {
    const override = { time: { hour: 7, minute: 0 }, targetDate: '2026-02-25' };
    const now = new Date('2026-02-25T07:01:00');
    expect(isNextOverrideExpired(override, now)).toBe(true);
  });

  test('returns false when targetDate + time is in the future', () => {
    const override = { time: { hour: 7, minute: 0 }, targetDate: '2026-02-25' };
    const now = new Date('2026-02-25T06:59:00');
    expect(isNextOverrideExpired(override, now)).toBe(false);
  });

  test('returns true for legacy override without targetDate', () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing backward compatibility with legacy data
    const override = { time: { hour: 7, minute: 0 } } as any;
    expect(isNextOverrideExpired(override)).toBe(true);
  });
});

describe('computeOverrideTargetDate', () => {
  test('returns today if time has not passed yet', () => {
    const now = new Date('2026-02-25T06:00:00');
    expect(computeOverrideTargetDate({ hour: 7, minute: 0 }, now)).toBe('2026-02-25');
  });

  test('returns tomorrow if time has already passed', () => {
    const now = new Date('2026-02-25T08:00:00');
    expect(computeOverrideTargetDate({ hour: 7, minute: 0 }, now)).toBe('2026-02-26');
  });

  test('returns tomorrow if time is exactly now', () => {
    const now = new Date('2026-02-25T07:00:00');
    expect(computeOverrideTargetDate({ hour: 7, minute: 0 }, now)).toBe('2026-02-26');
  });
});
