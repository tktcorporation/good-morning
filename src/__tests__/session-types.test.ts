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
});
