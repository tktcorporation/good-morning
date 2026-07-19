import {
  computeOverrideTargetDate,
  getNextLogicalDay,
  isNextOverrideExpired,
  resolveTimeForDate,
  resolveTimeForDismiss,
  type WakeTarget,
} from '../types/wake-target';
import { formatLocalDate } from '../utils/date';

describe('resolveTimeForDate', () => {
  const baseTarget: WakeTarget = {
    defaultTime: { hour: 7, minute: 0 },
    dayOverrides: {},
    nextOverride: null,
    todos: [],
    enabled: true,
    targetSleepMinutes: null,
    wakeUpGoalBufferMinutes: 30,
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

  test('nextOverride は targetDate 当日にのみ適用され、他の日は defaultTime にフォールバックする', () => {
    const target: WakeTarget = {
      ...baseTarget,
      nextOverride: { time: { hour: 9, minute: 0 }, targetDate: '2026-02-25' },
    };
    // targetDate の翌日（木曜）→ override は適用されない
    const nextDay = new Date('2026-02-26T00:00:00');
    expect(resolveTimeForDate(target, nextDay)).toEqual({ hour: 7, minute: 0 });
  });

  test('nextOverride は targetDate 以外の日の dayOverride を上書きしない', () => {
    const target: WakeTarget = {
      ...baseTarget,
      dayOverrides: { 4: { type: 'off' } },
      nextOverride: { time: { hour: 9, minute: 0 }, targetDate: '2026-02-25' },
    };
    // 木曜 = DayOfWeek 4 は OFF のまま
    const thursday = new Date('2026-02-26T00:00:00');
    expect(resolveTimeForDate(target, thursday)).toBeNull();
  });

  test('期限切れが残留した nextOverride でも targetDate 以外の日には影響しない', () => {
    // clearExpiredOverride は通常起動時にしか呼ばれないため、
    // 期限切れ override が数日残留するケースがある
    const target: WakeTarget = {
      ...baseTarget,
      nextOverride: { time: { hour: 9, minute: 0 }, targetDate: '2026-02-20' },
    };
    const laterDay = new Date('2026-02-25T00:00:00');
    expect(resolveTimeForDate(target, laterDay)).toEqual({ hour: 7, minute: 0 });
  });
});

describe('resolveTimeForDismiss', () => {
  const baseTarget: WakeTarget = {
    defaultTime: { hour: 9, minute: 0 },
    dayOverrides: {},
    nextOverride: null,
    todos: [],
    enabled: true,
    targetSleepMinutes: null,
    wakeUpGoalBufferMinutes: 30,
  };

  test('override 対象日でなければ resolveTimeForDate と同じ結果を返す', () => {
    const dismissTime = new Date('2026-02-25T09:02:00');
    expect(resolveTimeForDismiss(baseTarget, dismissTime)).toEqual({ hour: 9, minute: 0 });
  });

  test('override 対象日で、dismiss 時刻が override 時刻に近ければ override を採用する', () => {
    // override(7:00) を通常アラーム(9:00)より早める設定。二重鳴動を許容する
    // 設計のため、二つの候補のうち dismiss 時刻に近い方を実際に鳴った
    // アラームとみなす
    const target: WakeTarget = {
      ...baseTarget,
      nextOverride: { time: { hour: 7, minute: 0 }, targetDate: '2026-02-26' },
    };
    const dismissTime = new Date('2026-02-26T07:03:00');
    expect(resolveTimeForDismiss(target, dismissTime)).toEqual({ hour: 7, minute: 0 });
  });

  test('override 対象日で、dismiss 時刻が通常アラーム時刻に近ければ通常時刻を採用する', () => {
    const target: WakeTarget = {
      ...baseTarget,
      nextOverride: { time: { hour: 7, minute: 0 }, targetDate: '2026-02-26' },
    };
    // 9:00（通常）の方が 7:00（override）より dismiss 時刻に近い
    const dismissTime = new Date('2026-02-26T08:58:00');
    expect(resolveTimeForDismiss(target, dismissTime)).toEqual({ hour: 9, minute: 0 });
  });

  test('override 対象日の当該曜日が OFF でも override 時刻を候補にする', () => {
    const target: WakeTarget = {
      ...baseTarget,
      dayOverrides: { 4: { type: 'off' } },
      nextOverride: { time: { hour: 7, minute: 0 }, targetDate: '2026-02-26' },
    };
    const dismissTime = new Date('2026-02-26T07:01:00');
    expect(resolveTimeForDismiss(target, dismissTime)).toEqual({ hour: 7, minute: 0 });
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

  test('パース不能な targetDate は期限切れ扱いになる（永遠に有効な override を作らない）', () => {
    const override = { time: { hour: 7, minute: 0 }, targetDate: 'not-a-date' };
    expect(isNextOverrideExpired(override, new Date('2026-02-25T00:00:00'))).toBe(true);
  });

  test('数値パースで NaN になる targetDate は期限切れ扱いになる', () => {
    const override = { time: { hour: 7, minute: 0 }, targetDate: '2026-xx-25' };
    expect(isNextOverrideExpired(override, new Date('2026-02-25T00:00:00'))).toBe(true);
  });
});

describe('computeOverrideTargetDate', () => {
  // UI は「明日だけ変更」(tomorrowOnly)。対象日は「論理的な翌日」:
  // dayBoundaryHour より前の深夜は「今夜の起床 = 当日」、それ以降は「翌日」。
  const DAY_BOUNDARY_HOUR = 4;

  test('朝（起床後）に設定すると、指定時刻が未到来でも対象日は翌日になる', () => {
    // 7:30 に「明日だけ 8:00」→ 今日の 8:00 ではなく明日の 8:00
    const now = new Date('2026-02-25T07:30:00');
    expect(computeOverrideTargetDate({ hour: 8, minute: 0 }, DAY_BOUNDARY_HOUR, now)).toBe(
      '2026-02-26',
    );
  });

  test('夜に設定すると対象日は翌日になる', () => {
    const now = new Date('2026-02-25T22:00:00');
    expect(computeOverrideTargetDate({ hour: 6, minute: 0 }, DAY_BOUNDARY_HOUR, now)).toBe(
      '2026-02-26',
    );
  });

  test('日付変更ライン前の深夜に設定すると対象日は当日（今夜の起床）になる', () => {
    // 0:30 はまだ「前日の夜」— このあと迎える朝が「明日」
    const now = new Date('2026-02-25T00:30:00');
    expect(computeOverrideTargetDate({ hour: 7, minute: 0 }, DAY_BOUNDARY_HOUR, now)).toBe(
      '2026-02-25',
    );
  });

  test('算出した対象日時が既に過去なら 1 日先送りする', () => {
    // 0:30 に「明日だけ 0:15」→ 当日 0:15 は過去なので翌日 0:15
    const now = new Date('2026-02-25T00:30:00');
    expect(computeOverrideTargetDate({ hour: 0, minute: 15 }, DAY_BOUNDARY_HOUR, now)).toBe(
      '2026-02-26',
    );
  });

  test('日付変更ラインが 0 時なら常に暦日の翌日になる', () => {
    const now = new Date('2026-02-25T00:30:00');
    expect(computeOverrideTargetDate({ hour: 7, minute: 0 }, 0, now)).toBe('2026-02-26');
  });
});

describe('getNextLogicalDay', () => {
  // target-edit のピッカー初期値が computeOverrideTargetDate と異なる基準
  // （暦日ベースの new Date() + 1日）で対象日を計算すると、dayBoundaryHour より
  // 前の深夜に開いた場合、表示される dayOverrides の曜日と実際に保存される
  // targetDate の曜日が食い違う
  const DAY_BOUNDARY_HOUR = 4;

  test('日付変更ライン前の深夜は、computeOverrideTargetDate と同じ対象日（暦日の当日）を指す', () => {
    const now = new Date('2026-02-25T00:30:00');
    expect(formatLocalDate(getNextLogicalDay(DAY_BOUNDARY_HOUR, now))).toBe(
      computeOverrideTargetDate({ hour: 7, minute: 0 }, DAY_BOUNDARY_HOUR, now),
    );
  });

  test('日付変更ライン後は、computeOverrideTargetDate と同じ対象日（暦日の翌日）を指す', () => {
    const now = new Date('2026-02-25T22:00:00');
    expect(formatLocalDate(getNextLogicalDay(DAY_BOUNDARY_HOUR, now))).toBe(
      computeOverrideTargetDate({ hour: 6, minute: 0 }, DAY_BOUNDARY_HOUR, now),
    );
  });
});
