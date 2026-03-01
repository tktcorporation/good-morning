/**
 * セッションライフサイクルのオーケストレーション層。
 *
 * 背景: セッション操作が wakeup.tsx（開始）→ index.tsx（完了）→ _layout.tsx（復元・スヌーズ）に
 * 散在していたため、各画面の責務が肥大化し、テストや変更が困難だった。
 * このモジュールに集約することで、画面は薄いレイヤーとして lifecycle 関数を呼ぶだけになる。
 *
 * 設計詳細: docs/plans/2026-03-01-session-lifecycle-service-design.md
 */

import { useMorningSessionStore } from '../stores/morning-session-store';
import type { AlarmTime } from '../types/alarm';
import type { MorningSession } from '../types/morning-session';
import type { WakeTarget } from '../types/wake-target';
import { SNOOZE_DURATION_SECONDS, SNOOZE_MAX_COUNT, updateLiveActivity } from './alarm-kit';

// ---------------------------------------------------------------------------
// 移植済み関数（元: snooze.ts）
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 新規スタブ（後続タスクで実装予定）
// ---------------------------------------------------------------------------

/**
 * startMorningSession に渡すパラメータ。
 *
 * アラーム dismiss 時に画面（wakeup.tsx）が収集した情報を受け取る。
 * セッション開始に必要な全情報をまとめることで、呼び出し元の責務を最小化する。
 */
export interface StartSessionParams {
  /** 現在の WakeTarget（TODO テンプレート・アラーム再スケジュール情報を含む） */
  readonly target: WakeTarget;
  /** resolveTimeForDate() で解決済みのアラーム目標時刻 */
  readonly resolvedTime: AlarmTime;
  /** ユーザーが dismiss した時刻 */
  readonly dismissTime: Date;
  /** wakeup 画面がマウントされた時刻（alarmTriggeredAt の近似値として使用） */
  readonly mountedAt: Date;
  /** 日付変更ラインの時刻（getLogicalDateString に渡す） */
  readonly dayBoundaryHour: number;
}

/**
 * アラーム dismiss 時にモーニングセッションを開始する。
 *
 * 背景: wakeup.tsx に散在していたセッション開始ロジック（レコード作成 → セッション開始 →
 * スヌーズスケジュール → Live Activity 開始）をこの関数に集約する。
 * 呼び出し元は dismiss 時の情報を StartSessionParams にまとめて渡すだけでよい。
 *
 * 呼び出し元: app/wakeup.tsx（handleDismiss）
 * 実装予定: Task 3
 */
export async function startMorningSession(_params: StartSessionParams): Promise<void> {
  throw new Error('Not implemented');
}

/**
 * TODO 全完了時にモーニングセッションを終了する。
 *
 * 背景: index.tsx の completion effect に散在していたセッション完了ロジック
 * （スヌーズキャンセル → Live Activity 終了 → レコード更新 → アラーム再スケジュール →
 * セッションクリア）をこの関数に集約する。
 *
 * 呼び出し元: app/(tabs)/index.tsx（TODO 全完了検知時）
 * 実装予定: Task 4
 */
export async function completeMorningSession(_session: MorningSession): Promise<void> {
  throw new Error('Not implemented');
}

/**
 * アプリ起動時にセッション状態を復元・クリーンアップする。
 *
 * 背景: _layout.tsx に散在していた起動時処理（期限切れセッションのクリーンアップ →
 * スヌーズカウントダウン復元 → 全完了済み Live Activity の回収）をこの関数に集約する。
 * アプリが kill された後の再起動でも、前回のセッション状態を正しく復元できる。
 *
 * 呼び出し元: app/_layout.tsx（アプリ起動時）
 * 実装予定: Task 5
 */
export function restoreSessionOnLaunch(_dayBoundaryHour: number): void {
  throw new Error('Not implemented');
}
