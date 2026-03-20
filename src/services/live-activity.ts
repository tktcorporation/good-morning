/**
 * @deprecated Effect 版 (AlarmKitService) に移行済み。
 * このファイルはレガシーテスト (session-lifecycle.test.ts) が
 * session-lifecycle.ts 経由で間接的に依存しているため残存。
 * テストを Effect 版に移行次第、session-lifecycle.ts と共に削除予定。
 */

// biome-ignore lint/suspicious/noConsole: AlarmKit errors need logging for debugging
const logError = console.error;

let kit: Record<string, unknown> | null = null;
try {
  kit = require('expo-alarm-kit') as Record<string, unknown>;
} catch {
  // no-op
}

interface LiveActivityTodo {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}

export async function startLiveActivity(
  todos: readonly LiveActivityTodo[],
  snoozeFiresAt: string | null,
): Promise<string | null> {
  if (kit === null) return null;
  try {
    const snoozeEpoch =
      snoozeFiresAt !== null ? Math.floor(new Date(snoozeFiresAt).getTime() / 1000) : null;
    const startFn = kit.startLiveActivity;
    if (typeof startFn !== 'function') return null;
    const result = await (
      startFn as (todos: object[], epoch: number | null) => Promise<string | null>
    )(
      todos.map((t) => ({ id: t.id, title: t.title, completed: t.completed })),
      snoozeEpoch,
    );
    return result ?? null;
  } catch (e) {
    logError('[AlarmKit] startLiveActivity failed:', e);
    return null;
  }
}

export async function updateLiveActivity(
  activityId: string,
  todos: readonly LiveActivityTodo[],
  snoozeFiresAt: string | null,
): Promise<void> {
  if (kit === null) return;
  try {
    const updateFn = kit.updateLiveActivity;
    if (typeof updateFn !== 'function') return;
    const snoozeEpoch =
      snoozeFiresAt !== null ? Math.floor(new Date(snoozeFiresAt).getTime() / 1000) : null;
    await (updateFn as (id: string, todos: object[], epoch: number | null) => Promise<boolean>)(
      activityId,
      todos.map((t) => ({ id: t.id, title: t.title, completed: t.completed })),
      snoozeEpoch,
    );
  } catch (e) {
    logError('[AlarmKit] updateLiveActivity failed:', e);
  }
}

export async function endLiveActivity(activityId: string): Promise<void> {
  if (kit === null) return;
  try {
    const endFn = kit.endLiveActivity;
    if (typeof endFn !== 'function') return;
    await (endFn as (id: string) => Promise<boolean>)(activityId);
  } catch (e) {
    logError('[AlarmKit] endLiveActivity failed:', e);
  }
}
