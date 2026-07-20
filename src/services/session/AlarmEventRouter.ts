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
import { resolveDismissDateStr, resolveDismissInstant } from '../../types/wake-target';
import { AlarmKit } from '../AlarmKitService';
import type { Notification } from '../NotificationService';
import { expireSessionIfNeeded } from './CompletionService';
import { handleAlarmDismissEffect } from './DismissService';
import {
  handleSnoozeArrivalEffect,
  recoverMissedDismiss,
  restoreSessionOnLaunch,
} from './RecoveryService';
import { isDismissProcessingReady } from './readiness';
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
    const recordState = useWakeRecordStore.getState();

    // ストア未ロードのまま進むと誤った状態でセッションを自動開始・永続化して
    // しまう（理由は isDismissProcessingReady 参照）。
    if (!isDismissProcessingReady()) {
      return false;
    }

    if (sessionStore.isActive()) return false;

    const now = new Date();
    const windowInfo = checkSessionWindow(now, target, dayBoundaryHour);
    if (windowInfo === null) return false;

    const { records } = recordState;
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
    const now = new Date();
    const alarmInstant = resolveDismissInstant(target, now);
    if (alarmInstant === null) return;

    // override 対象日は通常の繰り返しアラームも維持される設計（二重鳴動を許容）
    // のため、同日内で override → 通常アラームの順に2回 dismiss されうる。
    // recoverMissedDismiss はセッションアクティブ・recordId 確定済みを「重複」
    // として false を返すが、呼び出し元はこれを「未処理」と誤認してここに
    // フォールバックする。addRecord は同日マージで上書きする実装のため、
    // 無条件に処理すると既存の WakeRecord（TODO 進捗・完了状態）を巻き戻してしまう
    const recordState = useWakeRecordStore.getState();
    if (recordState.loaded) {
      const dateStr = resolveDismissDateStr(alarmInstant, now, target, dayBoundaryHour);
      if (recordState.records.some((r) => r.date === dateStr)) return;
    }

    yield* handleAlarmDismissEffect({
      target,
      alarmInstant,
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
      const handled = yield* handleSnoozeArrivalEffect;
      // handleSnoozeArrivalEffect は session が存在すれば true を返すが、
      // tryAutoStartSession による自動開始セッション（recordId=null）は
      // 「dismiss 未処理」を意味する。true だからと dismiss 復元をスキップ
      // すると、WakeRecord が作られずネイティブスヌーズもセッションに
      // 取り込まれないまま残り、後続の同期処理にそのスヌーズを孤立扱いで
      // キャンセルされてしまう
      const recordId = useMorningSessionStore.getState().session?.recordId ?? null;
      if (!handled || recordId === null) {
        // アプリ非起動中に本アラームが dismiss され、スヌーズ通知経由で
        // 起動したケース。セッションが無いままスヌーズ到着だけ処理して終わると、
        // 未消化の primary dismiss イベント（WakeRecord・セッション・
        // ネイティブスヌーズ取り込み）が放置される
        if (context === 'cold-start') {
          yield* restoreSessionOnLaunch(dayBoundaryHour);
        }
        yield* recoverMissedDismiss(dayBoundaryHour);
      }
      routerPush('/');
      return;
    }
    if (context === 'cold-start') {
      yield* restoreSessionOnLaunch(dayBoundaryHour);
    }
    const recovered = yield* recoverMissedDismiss(dayBoundaryHour);
    if (!recovered) {
      yield* handleInlineDismiss(dayBoundaryHour);
    }
    routerPush('/');
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
    /**
     * 呼び出し元が読み取り済みの launch payload（cold-start 用）。
     *
     * ネイティブの getLaunchPayload は取得と同時にクリアされる consume-once API。
     * _layout.tsx が waitFor の分岐判定のために先に読み取るため、ここで
     * 再読すると常に null になり、payload 分岐（dismiss 処理・スヌーズ到着）が
     * 一切実行されなくなる。読み取りは 1 箇所に限定し、値は明示的に引き渡す。
     * undefined（未指定）の場合のみネイティブから読む（foreground-resume 用）。
     */
    launchPayload?: { alarmId: string; payload: string | null } | null;
  },
): Effect.Effect<void, SessionError, AlarmKit | Notification> =>
  Effect.gen(function* () {
    const { routerPush, dayBoundaryHour, clearExpiredOverride } = opts;
    const kit = yield* AlarmKit;
    const payload =
      opts.launchPayload !== undefined ? opts.launchPayload : yield* kit.checkLaunchPayload;

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
