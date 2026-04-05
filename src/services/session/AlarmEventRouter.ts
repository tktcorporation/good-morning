/**
 * アラームイベントの統一エントリポイント。
 *
 * 背景: アプリは cold-start と foreground-resume の2つのコンテキストで
 * アラームイベントを処理する。このルーターが適切な処理フローに振り分ける。
 *
 * フロー:
 * 1. ペイロードあり → スヌーズ到着 or dismiss 処理をインライン実行
 * 2. ペイロードなし → セッション復元 → dismiss復元 → 自動開始
 *
 * 依存関係: types.ts, CompletionService.ts, RecoveryService.ts
 * 呼び出し元: app/_layout.tsx (初期化 + AppState listener)
 */

import { Effect } from 'effect';
import { useMorningSessionStore } from '../../stores/morning-session-store';
import { useWakeRecordStore } from '../../stores/wake-record-store';
import { useWakeTargetStore } from '../../stores/wake-target-store';
import type { SessionTodo } from '../../types/morning-session';
import type { WakeTarget } from '../../types/wake-target';
import { resolveTimeForDate } from '../../types/wake-target';
import { AlarmKit } from '../AlarmKitService';
import type { Notification } from '../NotificationService';
import { expireSessionIfNeeded } from './CompletionService';
import { handleAlarmDismissEffect } from './DismissService';
import {
  handleSnoozeArrivalEffect,
  recoverMissedDismiss,
  restoreSessionOnLaunch,
} from './RecoveryService';
import { checkSessionWindow, isSnoozePayload, type SessionError } from './types';

// ─── セッション自動開始 ─────────────────────────────────────────

/**
 * 時間ウィンドウに基づいてセッションを自動開始する Effect。
 * アラーム発火の成否に関わらず、ウィンドウ内であればセッションを作成する。
 *
 * @returns true if session was auto-started
 */
const tryAutoStartSession = (
  target: WakeTarget,
  dayBoundaryHour: number,
): Effect.Effect<boolean, never> =>
  Effect.gen(function* () {
    const sessionStore = useMorningSessionStore.getState();

    if (sessionStore.isActive()) return false;

    const now = new Date();
    const windowInfo = checkSessionWindow(now, target, dayBoundaryHour);
    if (windowInfo === null) return false;

    const { records } = useWakeRecordStore.getState();
    const todayRecord = records.find((r) => r.date === windowInfo.dateStr);
    if (todayRecord?.todosCompleted) return false;

    const sessionTodos: readonly SessionTodo[] = target.todos.map((todo) => ({
      id: todo.id,
      title: todo.title,
      completed: false,
      completedAt: null,
      type: todo.type,
      requiredCount: todo.requiredCount,
      currentCount: 0,
    }));

    yield* Effect.promise(() =>
      sessionStore.startSession(
        windowInfo.dateStr,
        sessionTodos,
        null,
        windowInfo.windowEnd.toISOString(),
      ),
    );

    return true;
  });

// ─── ペイロードあり dismiss 処理 ─────────────────────────────────

/**
 * AlarmKit 経由でアラームが dismiss されたとき、ネイティブ dismiss イベントが
 * 見つからなかった場合に直接 dismiss 処理を実行する Effect。
 *
 * 背景: AlarmKit がアラーム音と dismiss を処理済みのため、
 * アプリ側は WakeRecord 作成・セッション開始・スヌーズ登録を行うのみ。
 */
const handleInlineDismiss = (
  dayBoundaryHour: number,
): Effect.Effect<void, SessionError, AlarmKit | Notification> =>
  Effect.gen(function* () {
    const { target } = useWakeTargetStore.getState();
    if (target === null) return;
    const resolvedTime = resolveTimeForDate(target, new Date());
    if (resolvedTime === null) return;
    const now = new Date();
    yield* handleAlarmDismissEffect({
      target,
      resolvedTime,
      dismissTime: now,
      mountedAt: now,
      dayBoundaryHour,
    });
  });

// ─── ペイロードありのアラームイベント処理 ─────────────────────────

/**
 * AlarmKit launch payload が存在するときの処理。
 * スヌーズ到着 or 新規 dismiss のどちらかを実行する。
 */
const handlePayloadEvent = (
  context: 'cold-start' | 'foreground-resume',
  payload: { alarmId: string; payload: string | null },
  routerPush: (path: string) => void,
  dayBoundaryHour: number,
): Effect.Effect<void, SessionError, AlarmKit | Notification> =>
  Effect.gen(function* () {
    if (isSnoozePayload(payload)) {
      yield* handleSnoozeArrivalEffect;
      routerPush('/');
      return;
    }
    if (context === 'cold-start') {
      yield* restoreSessionOnLaunch(dayBoundaryHour);
    }
    const recovered = yield* recoverMissedDismiss(dayBoundaryHour);
    if (!recovered) {
      yield* handleInlineDismiss(dayBoundaryHour);
      routerPush('/');
    }
  });

// ─── 統一エントリポイント ──────────────────────────────────────────

/**
 * アラームイベント（cold-start / foreground-resume）を統一処理する Effect。
 *
 * cold-start: セッション復元 → dismiss復元 → 自動開始
 * foreground-resume: 期限切れチェック → dismiss復元 → 自動開始
 */
export const handleAlarmEventEffect = (
  context: 'cold-start' | 'foreground-resume',
  opts: {
    routerPush: (path: string) => void;
    dayBoundaryHour: number;
    clearExpiredOverride?: () => void;
  },
): Effect.Effect<void, SessionError, AlarmKit | Notification> =>
  Effect.gen(function* () {
    const { routerPush, dayBoundaryHour, clearExpiredOverride } = opts;
    const kit = yield* AlarmKit;
    const payload = yield* kit.checkLaunchPayload;

    if (payload !== null) {
      yield* handlePayloadEvent(context, payload, routerPush, dayBoundaryHour);
      return;
    }

    if (context === 'cold-start') {
      yield* restoreSessionOnLaunch(dayBoundaryHour);
      clearExpiredOverride?.();
    } else {
      yield* expireSessionIfNeeded;
    }

    const recovered = yield* recoverMissedDismiss(dayBoundaryHour);
    if (recovered) {
      routerPush('/');
      return;
    }

    const { target } = useWakeTargetStore.getState();
    if (target !== null) {
      yield* tryAutoStartSession(target, dayBoundaryHour);
    }
  });
