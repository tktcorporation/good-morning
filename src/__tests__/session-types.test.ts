import { checkSessionWindow, toWakeTodoRecords } from '../services/session/types';
import type { SessionTodo } from '../types/morning-session';
import type { WakeTarget } from '../types/wake-target';
import { DEFAULT_WAKE_TARGET } from '../types/wake-target';

describe('toWakeTodoRecords', () => {
  const todo = (over: Partial<SessionTodo>): SessionTodo => ({
    id: 'id',
    title: 'title',
    completed: false,
    completedAt: null,
    ...over,
  });

  it('完了済みタスクには配列順（1始まり）を orderCompleted として付ける', () => {
    const records = toWakeTodoRecords([
      todo({ id: 'a', completed: true, completedAt: '2026-02-22T06:00:00.000Z' }),
      todo({ id: 'b', completed: true, completedAt: '2026-02-22T06:01:00.000Z' }),
    ]);
    expect(records.map((r) => r.orderCompleted)).toEqual([1, 2]);
  });

  it('未完了タスクの orderCompleted は null', () => {
    const records = toWakeTodoRecords([todo({ id: 'a', completed: false })]);
    expect(records[0]?.orderCompleted).toBeNull();
  });

  it('id・title・completedAt・type を引き継ぐ', () => {
    const records = toWakeTodoRecords([
      todo({ id: 'squat', title: 'Squat', type: 'squat', completedAt: '2026-02-22T06:00:00.000Z' }),
    ]);
    expect(records[0]).toEqual({
      id: 'squat',
      title: 'Squat',
      completedAt: '2026-02-22T06:00:00.000Z',
      orderCompleted: null,
      type: 'squat',
    });
  });
});

describe('checkSessionWindow', () => {
  function targetWithTodos(overrides?: Partial<WakeTarget>): WakeTarget {
    return {
      ...DEFAULT_WAKE_TARGET,
      todos: [{ id: 'todo-1', title: 'Stretch', completed: false }],
      ...overrides,
    };
  }

  test('dayBoundaryHour がアラーム時刻より後でも、当日朝の nextOverride を見失わない', () => {
    // dayBoundaryHour=8（アラーム 7:00 より後）だと、アラーム前の時間帯は
    // 論理日付が前日に倒れ、nextOverride.targetDate（暦日）と噛み合わなくなる。
    // now の暦日が targetDate と一致する場合はそれを優先すべき
    const target = targetWithTodos({
      nextOverride: { time: { hour: 7, minute: 0 }, targetDate: '2026-02-26' },
    });
    const now = new Date('2026-02-26T06:45:00');

    const result = checkSessionWindow(now, target, 8);

    expect(result).not.toBeNull();
    expect(result?.resolvedTime).toEqual({ hour: 7, minute: 0 });
    expect(result?.dateStr).toBe('2026-02-26');
  });

  test('dayBoundaryHour が通常どおりアラーム時刻より前なら nextOverride を正しく解決する', () => {
    const target = targetWithTodos({
      nextOverride: { time: { hour: 7, minute: 0 }, targetDate: '2026-02-26' },
    });
    const now = new Date('2026-02-26T06:45:00');

    const result = checkSessionWindow(now, target, 4);

    expect(result).not.toBeNull();
    expect(result?.resolvedTime).toEqual({ hour: 7, minute: 0 });
  });

  test('override 発火直後（アラーム後〜windowEnd の後半）でも nextOverride のウィンドウが有効なまま', () => {
    // isNextOverrideExpired はアラーム時刻ちょうどで期限切れになるため、
    // これを条件に含めるとアラーム後半分（07:00-07:30）が defaultTime 基準の
    // 判定に落ち、鳴った直後にアプリを開いてもセッションが自動開始しない
    const target = targetWithTodos({
      defaultTime: { hour: 22, minute: 0 },
      nextOverride: { time: { hour: 7, minute: 0 }, targetDate: '2026-02-26' },
    });
    const now = new Date('2026-02-26T07:15:00');

    const result = checkSessionWindow(now, target, 8);

    expect(result).not.toBeNull();
    expect(result?.resolvedTime).toEqual({ hour: 7, minute: 0 });
  });

  test('now の暦日が targetDate と異なる場合は nextOverride を適用しない', () => {
    const target = targetWithTodos({
      defaultTime: { hour: 9, minute: 0 },
      nextOverride: { time: { hour: 7, minute: 0 }, targetDate: '2026-02-27' },
    });
    // defaultTime(9:00) のウィンドウ内（8:30-9:30）。
    // nextOverride が誤って適用されると resolvedTime が 7:00 になってしまう
    const now = new Date('2026-02-26T08:45:00');

    const result = checkSessionWindow(now, target, 8);

    expect(result).not.toBeNull();
    expect(result?.resolvedTime).toEqual({ hour: 9, minute: 0 });
  });

  test('nextOverride が深夜0時台前半でも、その前夜のセッションウィンドウ前半で認識される', () => {
    // アラーム 00:10 のセッションウィンドウは 23:40(前日)〜00:40(targetDate)。
    // now の暦日はまだ前日のままだが、targetDate の override として扱われるべき
    const target = targetWithTodos({
      nextOverride: { time: { hour: 0, minute: 10 }, targetDate: '2026-02-26' },
    });
    const now = new Date('2026-02-25T23:50:00');

    const result = checkSessionWindow(now, target, 4);

    expect(result).not.toBeNull();
    expect(result?.resolvedTime).toEqual({ hour: 0, minute: 10 });
    expect(result?.dateStr).toBe('2026-02-26');
  });

  test('nextOverride が深夜0時台前半でも、ウィンドウ外の前夜早い時間帯では適用しない', () => {
    // 23:00 は 00:10 のセッションウィンドウ（23:40〜00:40）より前
    const target = targetWithTodos({
      defaultTime: { hour: 23, minute: 0 },
      nextOverride: { time: { hour: 0, minute: 10 }, targetDate: '2026-02-26' },
    });
    const now = new Date('2026-02-25T23:00:00');

    const result = checkSessionWindow(now, target, 4);

    expect(result).not.toBeNull();
    expect(result?.resolvedTime).toEqual({ hour: 23, minute: 0 });
    expect(result?.dateStr).toBe('2026-02-25');
  });

  test('nextOverride の前夜ウィンドウに通常アラームが近接する場合、regular に近ければ通常アラームの日のまま扱う', () => {
    // resolveTimeForDismiss は暦日不一致（23:50 の暦日は override の targetDate
    // と異なる）のため regular（23:50）と判定する。resolveOverrideAwareDateStr
    // がこれと矛盾して override 対象日を返すと、通常アラームの dismiss 記録が
    // override 対象日に紐づいてしまい、後続の実際の override dismiss が
    // 同日重複と誤判定されて記録されなくなる
    const target = targetWithTodos({
      defaultTime: { hour: 23, minute: 50 },
      nextOverride: { time: { hour: 0, minute: 10 }, targetDate: '2026-02-26' },
    });
    const now = new Date('2026-02-25T23:50:00');

    const result = checkSessionWindow(now, target, 4);

    expect(result).not.toBeNull();
    expect(result?.resolvedTime).toEqual({ hour: 23, minute: 50 });
    expect(result?.dateStr).toBe('2026-02-25');
  });

  test('前夜の通常アラームが発火済みでアフターウィンドウ内なら、近接する翌暦日の override より優先する', () => {
    // 通常 23:25 は既に発火済み（アフターウィンドウ 23:25-23:55 内）。
    // override 00:10(翌日) までの分差だけで比較すると override の方が近い
    // （overrideDiff=20 < regularDiff=25）が、既に発火して有効中の通常アラームの
    // セッションを、まだ発火していない override が奪ってはならない
    const target = targetWithTodos({
      defaultTime: { hour: 23, minute: 25 },
      nextOverride: { time: { hour: 0, minute: 10 }, targetDate: '2026-02-26' },
    });
    const now = new Date('2026-02-25T23:50:00');

    const result = checkSessionWindow(now, target, 4);

    expect(result).not.toBeNull();
    expect(result?.resolvedTime).toEqual({ hour: 23, minute: 25 });
    expect(result?.dateStr).toBe('2026-02-25');
  });

  test('同日 override と通常アラームのウィンドウが重なる場合、既に発火した方を優先する', () => {
    // override(7:00)・通常(7:10) のウィンドウは重なる（6:30-7:30 と 6:40-7:40）。
    // now=7:05 は両方のウィンドウ内だが、候補配列への追加順（通常→override）
    // だけで最初に一致したものを返すと、まだ発火していない通常(7:10)を
    // 誤って選んでしまう。実際に発火済みの override(7:00) を優先する必要がある
    const target = targetWithTodos({
      defaultTime: { hour: 7, minute: 10 },
      nextOverride: { time: { hour: 7, minute: 0 }, targetDate: '2026-02-26' },
    });
    const now = new Date('2026-02-26T07:05:00');

    const result = checkSessionWindow(now, target, 4);

    expect(result).not.toBeNull();
    expect(result?.resolvedTime).toEqual({ hour: 7, minute: 0 });
    expect(result?.windowEnd).toEqual(new Date('2026-02-26T07:30:00'));
  });

  test('override 対象日でも、まだ発火していない通常アラームのウィンドウ内なら通常アラームでセッションを自動開始する', () => {
    // 二重鳴動を許容する設計のため、override 対象日でも通常アラームは維持される。
    // resolveTimeForDate は override を常に優先するため、これをそのまま使うと
    // 通常アラーム(7:00)のウィンドウ内でも override(9:00)のウィンドウ判定に
    // 落ちてしまい、実際に発火する 7:00 のアラームでセッションが自動開始されない
    const target = targetWithTodos({
      defaultTime: { hour: 7, minute: 0 },
      nextOverride: { time: { hour: 9, minute: 0 }, targetDate: '2026-02-26' },
    });
    const now = new Date('2026-02-26T06:45:00');

    const result = checkSessionWindow(now, target, 4);

    expect(result).not.toBeNull();
    expect(result?.resolvedTime).toEqual({ hour: 7, minute: 0 });
  });

  test('override 対象日で、override 自身のウィンドウ内なら override でセッションを自動開始する', () => {
    const target = targetWithTodos({
      defaultTime: { hour: 7, minute: 0 },
      nextOverride: { time: { hour: 9, minute: 0 }, targetDate: '2026-02-26' },
    });
    const now = new Date('2026-02-26T08:45:00');

    const result = checkSessionWindow(now, target, 4);

    expect(result).not.toBeNull();
    expect(result?.resolvedTime).toEqual({ hour: 9, minute: 0 });
  });

  test('override 対象日で、通常・override いずれのウィンドウにも入っていなければ自動開始しない', () => {
    const target = targetWithTodos({
      defaultTime: { hour: 7, minute: 0 },
      nextOverride: { time: { hour: 9, minute: 0 }, targetDate: '2026-02-26' },
    });
    const now = new Date('2026-02-26T08:00:00');

    const result = checkSessionWindow(now, target, 4);

    expect(result).toBeNull();
  });
});
