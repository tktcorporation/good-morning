/**
 * Live Activity (ロック画面ウィジェット) の管理を担当するモジュール。
 *
 * 背景: alarm-kit.ts が肥大化していたため、Live Activity 関連の関数を分離した。
 * getAlarmKit() と logError を alarm-kit.ts から import して使う。
 *
 * 呼び出し元:
 *   - src/services/session-lifecycle.ts (セッション開始/完了/復元時)
 *   - app/(tabs)/index.tsx (TODO トグル時の進捗更新)
 */

import { getAlarmKit, logError } from './alarm-kit';

/**
 * Live Activity ウィジェットに表示するTODO項目。
 * SessionTodo の軽量サブセットで、ネイティブ側に渡すために plain object にする。
 */
export interface LiveActivityTodo {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}

/**
 * ロック画面にTODO進捗とスヌーズカウントダウンを表示する Live Activity を開始する。
 *
 * ネイティブモジュールが未実装の場合は null を返し、アプリの動作には影響しない（graceful degradation）。
 * 呼び出し元: app/wakeup.tsx (セッション開始＋スヌーズスケジュール後)
 */
export async function startLiveActivity(
  todos: readonly LiveActivityTodo[],
  snoozeFiresAt: string | null,
): Promise<string | null> {
  const kit = getAlarmKit();
  if (kit === null) return null;

  try {
    const snoozeEpoch =
      snoozeFiresAt !== null ? Math.floor(new Date(snoozeFiresAt).getTime() / 1000) : null;
    const startFn = (kit as Record<string, unknown>).startLiveActivity;
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

/**
 * Live Activity のTODO進捗・スヌーズカウントダウンを更新する。
 *
 * 呼び出し元:
 *   - app/(tabs)/index.tsx: TODOトグル時に完了状態を反映
 *   - app/wakeup.tsx: スヌーズ再発火時に新しいカウントダウンを反映
 */
export async function updateLiveActivity(
  activityId: string,
  todos: readonly LiveActivityTodo[],
  snoozeFiresAt: string | null,
): Promise<void> {
  const kit = getAlarmKit();
  if (kit === null) return;

  try {
    const updateFn = (kit as Record<string, unknown>).updateLiveActivity;
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

/**
 * Live Activity を終了してロック画面から除去する。
 *
 * 呼び出し元: app/(tabs)/index.tsx (TODO全完了時、セッションクリア前)
 */
export async function endLiveActivity(activityId: string): Promise<void> {
  const kit = getAlarmKit();
  if (kit === null) return;

  try {
    const endFn = (kit as Record<string, unknown>).endLiveActivity;
    if (typeof endFn !== 'function') return;
    await (endFn as (id: string) => Promise<boolean>)(activityId);
  } catch (e) {
    logError('[AlarmKit] endLiveActivity failed:', e);
  }
}
