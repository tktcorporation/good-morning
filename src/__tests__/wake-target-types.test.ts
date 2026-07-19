import {
  getNextLogicalDay,
  isNextOverrideExpired,
  resolveDismissDateStr,
  resolveDismissInstant,
  resolveNextAlarmDate,
  resolveNextAlarmTime,
  resolveOverrideEditDay,
  resolveOverrideSaveDate,
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
      defaultTime: { hour: 8, minute: 0 },
      nextOverride: { time: { hour: 7, minute: 0 }, targetDate: '2026-02-26' },
    };
    // 両方とも dismiss 時刻より前（発火済み）。8:00（通常）の方が 7:00（override）
    // より dismiss 時刻に近い
    const dismissTime = new Date('2026-02-26T08:58:00');
    expect(resolveTimeForDismiss(target, dismissTime)).toEqual({ hour: 8, minute: 0 });
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

  test('override 時刻が深夜に近く、日をまたいで dismiss された場合は override を採用する', () => {
    // override は前日 23:50 に設定。実際に鳴って dismiss されたのはそのアラーム
    // だが、dismiss が日付をまたいだ直後（00:05）だと暦日一致だけの判定では
    // 翌日（targetDate の翌日）の通常アラームに誤って解決してしまう
    const target: WakeTarget = {
      ...baseTarget,
      nextOverride: { time: { hour: 23, minute: 50 }, targetDate: '2026-02-26' },
    };
    const dismissTime = new Date('2026-02-27T00:05:00');
    expect(resolveTimeForDismiss(target, dismissTime)).toEqual({ hour: 23, minute: 50 });
  });

  test('override が深夜に近くても、日をまたいだ dismiss が翌日の通常アラームに近ければ通常時刻を採用する', () => {
    const target: WakeTarget = {
      ...baseTarget,
      defaultTime: { hour: 8, minute: 0 },
      nextOverride: { time: { hour: 23, minute: 50 }, targetDate: '2026-02-26' },
    };
    // 08:58 は 2026-02-27（targetDate の翌日）の通常アラーム(8:00、発火済み)に近い
    const dismissTime = new Date('2026-02-27T08:58:00');
    expect(resolveTimeForDismiss(target, dismissTime)).toEqual({ hour: 8, minute: 0 });
  });

  test('通常アラームが時刻的に近くても、まだ発火していない（未来の）場合は候補から除外する', () => {
    // override(7:00, 一回限り) と通常アラーム(7:10) が近接。dismiss(7:06) は
    // override 発火後 6 分・通常アラームの発火(7:10)まではまだ 4 分ある。
    // 絶対時刻差だけで比較すると 7:10 の方が近く選ばれてしまうが、
    // 7:10 のアラームは 7:06 時点でまだ鳴っていないので dismiss の原因になり得ない
    const target: WakeTarget = {
      ...baseTarget,
      defaultTime: { hour: 7, minute: 10 },
      nextOverride: { time: { hour: 7, minute: 0 }, targetDate: '2026-02-26' },
    };
    const dismissTime = new Date('2026-02-26T07:06:00');
    expect(resolveTimeForDismiss(target, dismissTime)).toEqual({ hour: 7, minute: 0 });
  });

  test('深夜またぎでも、通常アラームがまだ発火していない場合は override を採用する', () => {
    // override（前日 23:50）は常に発火済み。通常アラーム（当日 00:10）は
    // dismiss(00:05) 時点ではまだ未来なので候補から除外し、override を採用する
    const target: WakeTarget = {
      ...baseTarget,
      defaultTime: { hour: 0, minute: 10 },
      nextOverride: { time: { hour: 23, minute: 50 }, targetDate: '2026-02-26' },
    };
    const dismissTime = new Date('2026-02-27T00:05:00');
    expect(resolveTimeForDismiss(target, dismissTime)).toEqual({ hour: 23, minute: 50 });
  });

  test('override 対象日当日でも、前日の通常アラームがまだ発火していない override より近ければそちらを採用する', () => {
    // 通常 23:50(前日)・override 00:10(targetDate=当日) で、dismiss が
    // override 対象日当日の 00:05（override 発火前）に行われた場合、
    // 「同日候補（当日 override・当日 regular）」だけで判定すると両方とも
    // まだ未来になってしまい、実際に発火済みの前日 23:50 の通常アラームが
    // 候補から漏れて誤った結果になる
    const target: WakeTarget = {
      ...baseTarget,
      defaultTime: { hour: 23, minute: 50 },
      nextOverride: { time: { hour: 0, minute: 10 }, targetDate: '2026-02-26' },
    };
    const dismissTime = new Date('2026-02-26T00:05:00');
    expect(resolveTimeForDismiss(target, dismissTime)).toEqual({ hour: 23, minute: 50 });
  });
});

describe('resolveDismissInstant', () => {
  const baseTarget: WakeTarget = {
    defaultTime: { hour: 9, minute: 0 },
    dayOverrides: {},
    nextOverride: null,
    todos: [],
    enabled: true,
    targetSleepMinutes: null,
    wakeUpGoalBufferMinutes: 30,
  };

  test('同日 override では dismissTime と同じ暦日の日時を返す', () => {
    const target: WakeTarget = {
      ...baseTarget,
      nextOverride: { time: { hour: 7, minute: 0 }, targetDate: '2026-02-26' },
    };
    const dismissTime = new Date('2026-02-26T07:03:00');
    expect(resolveDismissInstant(target, dismissTime)).toEqual(new Date('2026-02-26T07:00:00'));
  });

  test('深夜またぎで override が採用された場合、発火日は前日の日付になる', () => {
    // dismissTime の暦日（2026-02-27）と組み合わせると goalDeadline 等の
    // 計算が 1 日ズレるため、実際に発火した前日（2026-02-26）の日時を返す必要がある
    const target: WakeTarget = {
      ...baseTarget,
      nextOverride: { time: { hour: 23, minute: 50 }, targetDate: '2026-02-26' },
    };
    const dismissTime = new Date('2026-02-27T00:05:00');
    expect(resolveDismissInstant(target, dismissTime)).toEqual(new Date('2026-02-26T23:50:00'));
  });

  test('深夜またぎで通常アラームが採用された場合は dismissTime と同じ暦日の日時を返す', () => {
    const target: WakeTarget = {
      ...baseTarget,
      defaultTime: { hour: 8, minute: 0 },
      nextOverride: { time: { hour: 23, minute: 50 }, targetDate: '2026-02-26' },
    };
    const dismissTime = new Date('2026-02-27T08:58:00');
    expect(resolveDismissInstant(target, dismissTime)).toEqual(new Date('2026-02-27T08:00:00'));
  });
});

describe('resolveDismissDateStr', () => {
  const baseTarget: WakeTarget = {
    defaultTime: { hour: 23, minute: 50 },
    dayOverrides: {},
    nextOverride: { time: { hour: 0, minute: 10 }, targetDate: '2026-02-26' },
    todos: [],
    enabled: true,
    targetSleepMinutes: null,
    wakeUpGoalBufferMinutes: 30,
  };

  test('override 自身が発火した場合は override.targetDate を返す', () => {
    const dismissTime = new Date('2026-02-26T00:10:00');
    const alarmInstant = resolveDismissInstant(baseTarget, dismissTime);
    if (alarmInstant === null) throw new Error('alarmInstant should not be null');
    expect(resolveDismissDateStr(alarmInstant, dismissTime, baseTarget, 4)).toBe('2026-02-26');
  });

  test('暦日は override 対象日と一致するが、実際に発火したのは前夜の通常アラームの場合は前日の論理日付を返す', () => {
    // dismissTime（00:05）の暦日は override.targetDate（2026-02-26）と一致するが、
    // 実際に発火したのは前夜 23:50 の通常アラーム。dateStr は override 対象日では
    // なく、発火したアラームの論理日付（2026-02-25）を返す必要がある
    const dismissTime = new Date('2026-02-26T00:05:00');
    const alarmInstant = resolveDismissInstant(baseTarget, dismissTime);
    if (alarmInstant === null) throw new Error('alarmInstant should not be null');
    expect(resolveDismissDateStr(alarmInstant, dismissTime, baseTarget, 4)).toBe('2026-02-25');
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

describe('getNextLogicalDay', () => {
  const DAY_BOUNDARY_HOUR = 4;

  test('日付変更ライン前の深夜は、暦日の当日を指す', () => {
    // 0:30 はまだ「前日の夜」— このあと迎える朝が「明日」
    const now = new Date('2026-02-25T00:30:00');
    expect(formatLocalDate(getNextLogicalDay(DAY_BOUNDARY_HOUR, now))).toBe('2026-02-25');
  });

  test('日付変更ライン後は、暦日の翌日を指す', () => {
    const now = new Date('2026-02-25T22:00:00');
    expect(formatLocalDate(getNextLogicalDay(DAY_BOUNDARY_HOUR, now))).toBe('2026-02-26');
  });
});

describe('resolveOverrideSaveDate', () => {
  test('editDay と選択時刻の組み合わせがまだ未来なら editDay をそのまま返す', () => {
    const editDay = new Date('2026-02-26T00:00:00');
    const now = new Date('2026-02-25T07:30:00');
    expect(resolveOverrideSaveDate(editDay, { hour: 8, minute: 0 }, now)).toBe('2026-02-26');
  });

  test('editDay と選択時刻の組み合わせが既に過去なら 1 日先送りする', () => {
    // 0:30 に editDay=当日・選択時刻 0:15 → 当日 0:15 は既に過去なので翌日に先送り
    const editDay = new Date('2026-02-25T00:00:00');
    const now = new Date('2026-02-25T00:30:00');
    expect(resolveOverrideSaveDate(editDay, { hour: 0, minute: 15 }, now)).toBe('2026-02-26');
  });

  test('ピッカーの初期値から時刻を変更しても、resolveOverrideEditDay が確定した対象日のまま保存される', () => {
    // dayBoundaryHour=8・アラーム=7:00・now=7:30（境界通過前）で
    // resolveOverrideEditDay が確定した対象日（翌日）は、選択時刻をピッカーの
    // 初期値(7:00)から 8:00 に変更しても保たれる必要がある。now 基準で
    // 独立に対象日を再計算すると、8:00 はまだ今日来ていないため誤って
    // 当日と判定されてしまい、「明日だけ変更」のはずが当日 30 分後に鳴ってしまう
    const target: WakeTarget = {
      defaultTime: { hour: 7, minute: 0 },
      dayOverrides: {},
      nextOverride: null,
      todos: [],
      enabled: true,
      targetSleepMinutes: null,
      wakeUpGoalBufferMinutes: 30,
    };
    const now = new Date('2026-02-26T07:30:00');
    const editDay = resolveOverrideEditDay(target, 8, now);
    expect(resolveOverrideSaveDate(editDay, { hour: 8, minute: 0 }, now)).toBe('2026-02-27');
  });
});

describe('resolveOverrideEditDay', () => {
  const baseTarget: WakeTarget = {
    defaultTime: { hour: 7, minute: 0 },
    dayOverrides: {},
    nextOverride: null,
    todos: [],
    enabled: true,
    targetSleepMinutes: null,
    wakeUpGoalBufferMinutes: 30,
  };

  test('dayBoundaryHour がアラーム時刻より後だと、getNextLogicalDay だけでは今日の暦日に戻り、その時刻が既に過ぎていることを見落とす', () => {
    // dayBoundaryHour=8, アラーム=7:00。now=7:30 はアラーム発火後だが、
    // まだ境界(8:00)を過ぎていない。getNextLogicalDay(8, 7:30) は論理日が
    // まだ前日のままのため +1日しても「今日」の暦日に戻り、既に過ぎた
    // 7:00 をピッカーの初期値として表示してしまう。実際の保存
    // （resolveOverrideSaveDate）はこの「既に過ぎている」を検知して
    // さらに1日先送りするため、表示と保存の対象日がズレる
    const now = new Date('2026-02-26T07:30:00');
    const editDay = resolveOverrideEditDay(baseTarget, 8, now);
    expect(formatLocalDate(editDay)).toBe('2026-02-27');
  });

  test('通常時（境界通過前の深夜等ではない）は getNextLogicalDay と同じ対象日を返す', () => {
    const now = new Date('2026-02-25T22:00:00');
    const editDay = resolveOverrideEditDay(baseTarget, 4, now);
    expect(formatLocalDate(editDay)).toBe(formatLocalDate(getNextLogicalDay(4, now)));
  });
});

describe('resolveNextAlarmTime', () => {
  // resolveTimeForDate(target, now) は「今日」の予定時刻を返すだけで、
  // 今日のアラームが既に発火済みかどうかは考慮しない。ウィジェット等の
  // 「次のアラームはいつか」表示にそのまま使うと、今日のアラームを消化した
  // 後も同じ時刻を表示し続け、翌日に予定された nextOverride が反映されない
  const baseTarget: WakeTarget = {
    defaultTime: { hour: 7, minute: 0 },
    dayOverrides: {},
    nextOverride: null,
    todos: [],
    enabled: true,
    targetSleepMinutes: null,
    wakeUpGoalBufferMinutes: 30,
  };

  test('今日のアラームがまだ発火していなければ今日の時刻を返す', () => {
    const now = new Date('2026-02-26T06:00:00');
    expect(resolveNextAlarmTime(baseTarget, now, 4)).toEqual({ hour: 7, minute: 0 });
  });

  test('全曜日 OFF なら次のアラームは無い', () => {
    // 翌日だけ OFF にしても、週内の他の曜日にまだ有効なアラームがあれば
    // それが次のアラームになる（下の「翌日が OFF でも...」テストを参照）。
    // 本当に「次のアラームなし」になるのは全曜日 OFF の場合のみ
    const target: WakeTarget = {
      ...baseTarget,
      dayOverrides: {
        0: { type: 'off' },
        1: { type: 'off' },
        2: { type: 'off' },
        3: { type: 'off' },
        4: { type: 'off' },
        5: { type: 'off' },
        6: { type: 'off' },
      },
    };
    const now = new Date('2026-02-26T08:00:00');
    expect(resolveNextAlarmTime(target, now, 4)).toBeNull();
  });

  test('翌日に nextOverride が設定されていて、今日のアラームが既に発火済みなら override 時刻を返す', () => {
    // 二重鳴動を許容する設計のため、override 対象日でも通常アラームは維持
    // される。通常アラーム(10:00)が override(9:00)より後なので、翌日最初に
    // 鳴るのは override
    const target: WakeTarget = {
      ...baseTarget,
      defaultTime: { hour: 10, minute: 0 },
      nextOverride: { time: { hour: 9, minute: 0 }, targetDate: '2026-02-27' },
    };
    const now = new Date('2026-02-26T10:30:00');
    expect(resolveNextAlarmTime(target, now, 4)).toEqual({ hour: 9, minute: 0 });
  });

  test('翌日に nextOverride が設定されていても、今日のアラームがまだ発火していなければ今日の時刻を返す', () => {
    const target: WakeTarget = {
      ...baseTarget,
      nextOverride: { time: { hour: 9, minute: 0 }, targetDate: '2026-02-27' },
    };
    const now = new Date('2026-02-26T06:00:00');
    expect(resolveNextAlarmTime(target, now, 4)).toEqual({ hour: 7, minute: 0 });
  });

  test('dayBoundaryHour がアラーム時刻より後だと、発火後〜境界通過前は翌日の時刻を返す（境界前に戻らない）', () => {
    // dayBoundaryHour=8, アラーム=7:00。now=7:30 はアラーム発火後だが、
    // まだ境界(8:00)を過ぎていない。getNextLogicalDay(8, 7:30) は論理日が
    // まだ前日のままのため +1日しても「今日」に戻ってしまい、既に過ぎた
    // 7:00 を再び「次のアラーム」として返してしまう
    const now = new Date('2026-02-26T07:30:00');
    expect(resolveNextAlarmTime(baseTarget, now, 8)).toEqual({ hour: 7, minute: 0 });
    const resolvedDate = resolveNextAlarmDate(baseTarget, now, 8);
    expect(resolvedDate).not.toBeNull();
    expect(formatLocalDate(resolvedDate as Date)).toBe('2026-02-27');
  });

  test('override 対象日でも、通常アラームがまだ発火していなければそちらを次のアラームとして返す', () => {
    // override 対象日でも二重鳴動を許容する設計により通常アラームは維持される。
    // resolveTimeForDate は override を優先して1つの時刻しか返さないため、
    // これをそのまま使うと通常アラーム(7:00)がまだ鳴っていないのに
    // override(9:00)を「次のアラーム」として誤って報告してしまう
    const target: WakeTarget = {
      ...baseTarget,
      nextOverride: { time: { hour: 9, minute: 0 }, targetDate: '2026-02-26' },
    };
    const now = new Date('2026-02-26T06:00:00');
    expect(resolveNextAlarmTime(target, now, 4)).toEqual({ hour: 7, minute: 0 });
  });

  test('override が先に発火した後でも、同日のまだ発火していない通常アラームを次のアラームとして返す', () => {
    // override(7:00) 発火後、通常アラーム(9:00) がまだ未来なのに、
    // override 優先の単一候補判定だと「今日は発火済み」として翌日へ
    // スキップしてしまい、当日の通常アラームを見逃す
    const target: WakeTarget = {
      ...baseTarget,
      defaultTime: { hour: 9, minute: 0 },
      nextOverride: { time: { hour: 7, minute: 0 }, targetDate: '2026-02-26' },
    };
    const now = new Date('2026-02-26T07:05:00');
    expect(resolveNextAlarmTime(target, now, 4)).toEqual({ hour: 9, minute: 0 });
  });

  test('翌日が OFF でも、その後の有効な曜日まで探索して次のアラームを返す', () => {
    // 翌日だけを候補にすると OFF で候補が尽きてしまい、実際にはまだ
    // アクティブな繰り返しアラームがあるのに「次のアラームなし」と
    // 誤って報告してしまう
    const target: WakeTarget = {
      ...baseTarget,
      dayOverrides: { 5: { type: 'off' } }, // 金曜 OFF
    };
    // 2026-02-26 は木曜、2026-02-27 は金曜(OFF)、2026-02-28 は土曜
    const now = new Date('2026-02-26T08:00:00'); // 今日の 7:00 は発火済み
    expect(resolveNextAlarmTime(target, now, 4)).toEqual({ hour: 7, minute: 0 });
    const resolvedDate = resolveNextAlarmDate(target, now, 4);
    expect(resolvedDate).not.toBeNull();
    expect(formatLocalDate(resolvedDate as Date)).toBe('2026-02-28');
  });
});

describe('resolveNextAlarmDate', () => {
  const baseTarget: WakeTarget = {
    defaultTime: { hour: 7, minute: 0 },
    dayOverrides: {},
    nextOverride: null,
    todos: [],
    enabled: true,
    targetSleepMinutes: null,
    wakeUpGoalBufferMinutes: 30,
  };

  test('今日のアラームがまだ発火していなければ今日の日付を返す', () => {
    const now = new Date('2026-02-26T06:00:00');
    expect(resolveNextAlarmDate(baseTarget, now, 4)).toEqual(now);
  });

  test('今日のアラームが既に発火済みなら翌日の日付を返す', () => {
    const now = new Date('2026-02-26T08:00:00');
    expect(formatLocalDate(resolveNextAlarmDate(baseTarget, now, 4) as Date)).toBe('2026-02-27');
  });
});
