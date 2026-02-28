/**
 * スヌーズの自動制御ロジック。
 *
 * 背景: Issue #20 — スヌーズの発火をアプリが自動制御する。
 * ネイティブアラームのスヌーズ/停止の二択UIではなく、
 * TODO完了状態に基づいてアプリ側でスヌーズを制御する。
 *
 * _layout.tsx（スヌーズ再発火時・復元時）と app/(tabs)/index.tsx（初回スヌーズ＋TODO管理）から利用される。
 */

import { useMorningSessionStore } from '../stores/morning-session-store';
import { SNOOZE_DURATION_SECONDS, scheduleSnooze, updateLiveActivity } from './alarm-kit';

/**
 * スヌーズアラームをスケジュールし、ID と発火予定時刻をストアに保存する。
 * ID は cancelSnooze() でのキャンセルに、発火時刻はダッシュボードのカウントダウン表示に使われる。
 *
 * @returns スヌーズ発火予定時刻（ISO文字列）。スケジュール失敗時は null。
 *          呼び出し元で Live Activity 等に渡す一貫した値として使う。
 */
export async function scheduleAndStoreSnooze(): Promise<string | null> {
  const snoozeId = await scheduleSnooze();
  if (snoozeId === null) return null;

  const snoozeFiresAt = new Date(Date.now() + SNOOZE_DURATION_SECONDS * 1000).toISOString();
  useMorningSessionStore.getState().setSnoozeAlarmId(snoozeId);
  useMorningSessionStore.getState().setSnoozeFiresAt(snoozeFiresAt);
  return snoozeFiresAt;
}

/**
 * スヌーズ再発火時の処理。既存セッションに未完了TODOがあれば次のスヌーズを再スケジュールする。
 * 新しいレコードやセッションは作成しない — 初回 dismiss 時に作成済みのものを継続利用する。
 *
 * @returns true if snooze was rescheduled, false if session is complete or absent
 */
export async function handleSnoozeRefire(): Promise<boolean> {
  const sessionState = useMorningSessionStore.getState();
  if (sessionState.session !== null && !sessionState.areAllCompleted()) {
    const snoozeFiresAt = await scheduleAndStoreSnooze();

    // scheduleAndStoreSnooze の返り値を直接使うことで、
    // snoozeFiresAt の二重計算を防ぎ、ストアの値と一貫性を保つ。
    const activityId = sessionState.session?.liveActivityId ?? null;
    if (activityId !== null && snoozeFiresAt !== null) {
      updateLiveActivity(
        activityId,
        sessionState.session.todos.map((t) => ({
          id: t.id,
          title: t.title,
          completed: t.completed,
        })),
        snoozeFiresAt,
      );
    }
    return true;
  }
  return false;
}

/**
 * アプリ再起動時にスヌーズを復元する。
 *
 * 背景: snoozeAlarmId は AlarmKit のネイティブ ID でアプリ再起動後は無効になる。
 * そのため永続化ではなく、セッション復元時に再スケジュールするアプローチを取る。
 * 条件: セッションがアクティブ & TODO未完了 & スヌーズ未スケジュール（メモリ上）。
 *
 * 呼び出し元: _layout.tsx の初期化 effect（loadSession 完了後）
 * スヌーズ再発火経由（isSnooze === true）の場合は handleSnoozeRefire が処理するため不要。
 */
export async function restoreSnoozeIfNeeded(): Promise<boolean> {
  const state = useMorningSessionStore.getState();

  // セッションがない、または TODO が全完了なら復元不要
  if (state.session === null || state.areAllCompleted()) return false;

  // 既にスヌーズがスケジュール済み（メモリ上に ID がある）なら二重スケジュールを防ぐ
  if (state.snoozeAlarmId !== null) return false;

  await scheduleAndStoreSnooze();
  return true;
}
