import { toWakeTodoRecords } from '../services/session/types';
import type { SessionTodo } from '../types/morning-session';

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
