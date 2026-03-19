/**
 * アラームイベントの統一エントリポイント。
 *
 * 背景: アプリは cold-start と foreground-resume の2つのコンテキストで
 * アラームイベントを処理する。このルーターが適切な処理フローに振り分ける。
 *
 * フロー:
 * 1. ペイロードあり → スヌーズ到着 or wakeup画面へ
 * 2. ペイロードなし → セッション復元 → dismiss復元 → 自動開始
 *
 * 依存関係: types.ts, CompletionService.ts, RecoveryService.ts
 * 呼び出し元: app/_layout.tsx (初期化 + AppState listener)
 */

import { Effect } from 'effect';
import { useMorningSessionStore } from '../../../stores/morning-session-store';
import { useWakeRecordStore } from '../../../stores/wake-record-store';
import { useWakeTargetStore } from '../../../stores/wake-target-store';
import type { SessionTodo } from '../../../types/morning-session';
import type { WakeTarget } from '../../../types/wake-target';
import { AlarmKit } from '../AlarmKitService';
import type { Notification } from '../NotificationService';
import { expireSessionIfNeeded } from './CompletionService';
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
      if (isSnoozePayload(payload)) {
        yield* handleSnoozeArrivalEffect;
        routerPush('/');
      } else {
        if (context === 'cold-start') {
          yield* restoreSessionOnLaunch(dayBoundaryHour);
        }
        const recovered = yield* recoverMissedDismiss(dayBoundaryHour);
        if (!recovered) {
          routerPush('/wakeup');
        }
      }
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
