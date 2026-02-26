/**
 * スヌーズの自動制御ロジック。
 *
 * 背景: Issue #20 — スヌーズの発火をアプリが自動制御する。
 * ネイティブアラームのスヌーズ/停止の二択UIではなく、
 * TODO完了状態に基づいてアプリ側でスヌーズを制御する。
 *
 * wakeup.tsx と _layout.tsx の両方から利用される。
 */

import { useMorningSessionStore } from '../stores/morning-session-store';
import { SNOOZE_DURATION_SECONDS, scheduleSnooze, updateLiveActivity } from './alarm-kit';

/**
 * スヌーズアラームをスケジュールし、ID と発火予定時刻をストアに保存する。
 * ID は cancelSnooze() でのキャンセルに、発火時刻はダッシュボードのカウントダウン表示に使われる。
 */
export function scheduleAndStoreSnooze(): void {
  scheduleSnooze().then((snoozeId) => {
    if (snoozeId !== null) {
      const snoozeFiresAt = new Date(Date.now() + SNOOZE_DURATION_SECONDS * 1000).toISOString();
      useMorningSessionStore.getState().setSnoozeAlarmId(snoozeId);
      useMorningSessionStore.getState().setSnoozeFiresAt(snoozeFiresAt);
    }
  });
}

/**
 * スヌーズ再発火時の処理。既存セッションに未完了TODOがあれば次のスヌーズを再スケジュールする。
 * 新しいレコードやセッションは作成しない — 初回 dismiss 時に作成済みのものを継続利用する。
 *
 * @returns true if snooze was rescheduled, false if session is complete or absent
 */
export function handleSnoozeRefire(): boolean {
  const sessionState = useMorningSessionStore.getState();
  if (sessionState.session !== null && !sessionState.areAllCompleted()) {
    scheduleAndStoreSnooze();

    // Update Live Activity with new snooze countdown
    const activityId = sessionState.liveActivityId;
    if (activityId !== null) {
      const newSnoozeFiresAt = new Date(Date.now() + SNOOZE_DURATION_SECONDS * 1000).toISOString();
      updateLiveActivity(
        activityId,
        sessionState.session.todos.map((t) => ({
          id: t.id,
          title: t.title,
          completed: t.completed,
        })),
        newSnoozeFiresAt,
      );
    }
    return true;
  }
  return false;
}
