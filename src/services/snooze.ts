/**
 * スヌーズ発火時の処理ロジック。
 *
 * 背景: 先行スケジュール方式により、スヌーズアラームはアラーム設定時に一括スケジュール済み。
 * 発火時にはアプリ側で再スケジュールする必要がなく、Live Activity の更新のみ行う。
 *
 * _layout.tsx（スヌーズ再発火時）から利用される。
 */

import { useMorningSessionStore } from '../stores/morning-session-store';
import { SNOOZE_DURATION_SECONDS, updateLiveActivity } from './alarm-kit';

/**
 * スヌーズアラーム発火時の処理。再スケジュールは不要（先行スケジュール済み）。
 * Live Activity のカウントダウンを次のスヌーズ時刻に更新する。
 *
 * @returns true if session is active with incomplete todos, false otherwise
 */
export function handleSnoozeArrival(): boolean {
  const sessionState = useMorningSessionStore.getState();
  if (sessionState.session === null || sessionState.areAllCompleted()) {
    return false;
  }

  // 次のスヌーズ発火時刻を計算してストアに保存（カウントダウン表示用）
  const nextSnoozeFiresAt = new Date(Date.now() + SNOOZE_DURATION_SECONDS * 1000).toISOString();
  useMorningSessionStore.getState().setSnoozeFiresAt(nextSnoozeFiresAt);

  // Live Activity を更新（カウントダウン表示を次のスヌーズ時刻に）
  const activityId = sessionState.session.liveActivityId;
  if (activityId !== null) {
    updateLiveActivity(
      activityId,
      sessionState.session.todos.map((t) => ({
        id: t.id,
        title: t.title,
        completed: t.completed,
      })),
      nextSnoozeFiresAt,
    );
  }
  return true;
}
