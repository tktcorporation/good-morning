/**
 * スヌーズ発火時の処理ロジック。
 *
 * 背景: 先行スケジュール方式により、スヌーズアラームはアラーム設定時に一括スケジュール済み。
 * 発火時にはアプリ側で再スケジュールする必要がなく、Live Activity の更新のみ行う。
 *
 * _layout.tsx（スヌーズ再発火時）から利用される。
 */

import { useMorningSessionStore } from '../stores/morning-session-store';
import { SNOOZE_DURATION_SECONDS, SNOOZE_MAX_COUNT, updateLiveActivity } from './alarm-kit';

/**
 * アプリ再起動時にスヌーズカウントダウン表示を復元する。
 *
 * 背景: snoozeFiresAt はメモリのみ（永続化しない）ため、アプリ kill → 再起動で消失する。
 * セッション開始時刻と現在時刻から、次に発火するスヌーズの時刻を逆算してストアに設定する。
 * スヌーズ期間（9分 × 20本 = 3時間）が終了している場合は何もしない。
 *
 * 呼び出し元: app/_layout.tsx（通常起動時、セッションが有効な場合）
 */
export function restoreSnoozeCountdown(sessionStartedAt: string): void {
  const startMs = new Date(sessionStartedAt).getTime();
  const nowMs = Date.now();
  const elapsed = nowMs - startMs;
  const intervalMs = SNOOZE_DURATION_SECONDS * 1000;
  const totalDurationMs = intervalMs * SNOOZE_MAX_COUNT;

  // 全スヌーズが発火済み（3時間経過）なら復元不要
  if (elapsed >= totalDurationMs) return;

  // 次のスヌーズ発火時刻を逆算: ceil(経過時間 / 間隔) 番目のスヌーズ
  const nextIndex = Math.ceil(elapsed / intervalMs);
  const nextFireMs = startMs + nextIndex * intervalMs;

  // 計算上の発火時刻が既に過ぎている場合（境界値）はスキップ
  if (nextFireMs <= nowMs) return;

  useMorningSessionStore.getState().setSnoozeFiresAt(new Date(nextFireMs).toISOString());
}

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
