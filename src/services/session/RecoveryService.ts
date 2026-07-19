/**
 * セッション復元・回復の処理。
 *
 * 背景: iOS ではアラーム dismiss 時にアプリが起動しない場合がある。
 * アプリ起動時に以下の回復処理を行う:
 * 1. 期限切れセッションのクリーンアップ
 * 2. 別日のstaleセッションの破棄
 * 3. ネイティブ dismiss イベントからの WakeRecord + セッション復元
 * 4. スヌーズアラーム到着時の Live Activity 更新
 *
 * 依存関係: types.ts, DismissService.ts, CompletionService.ts
 * 呼び出し元: AlarmEventRouter (handleAlarmEventEffect)
 */

import { Effect } from 'effect';
import { useMorningSessionStore } from '../../stores/morning-session-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useWakeRecordStore } from '../../stores/wake-record-store';
import { useWakeTargetStore } from '../../stores/wake-target-store';
import { resolveDismissInstant, type WakeTarget } from '../../types/wake-target';
import { getLogicalDateString } from '../../utils/date';
import { getLocalizedTodoTitle } from '../../utils/todo-display';
import { AlarmKit, type AlarmKitError } from '../AlarmKitService';
import { cancelAlarmsByIds, SNOOZE_DURATION_SECONDS } from '../AlarmSchedulerService';
import type { Notification } from '../NotificationService';
import { expireSessionIfNeeded } from './CompletionService';
import { handleAlarmDismissEffect } from './DismissService';
import { isSnoozeEvent, resolveOverrideAwareDateStr, type SessionError } from './types';

/**
 * 別日の stale セッションを破棄する（Live Activity も終了）か、
 * 当日の完了済みセッションの dangling Live Activity を回収する。
 */
const cleanupStaleOrDanglingSession = (
  state: ReturnType<typeof useMorningSessionStore.getState>,
  today: string,
): Effect.Effect<void, SessionError, AlarmKit | Notification> =>
  Effect.gen(function* () {
    if (state.session === null) return;
    const kit = yield* AlarmKit;

    if (state.session.date !== today) {
      if (state.session.liveActivityId !== null) {
        yield* kit
          .endLiveActivity(state.session.liveActivityId)
          .pipe(Effect.catchAll(() => Effect.void));
      }
      yield* Effect.promise(() => state.clearSession());
      return;
    }

    if (state.areAllCompleted() && state.session.liveActivityId !== null) {
      yield* kit
        .endLiveActivity(state.session.liveActivityId)
        .pipe(Effect.catchAll(() => Effect.void));
    }
  });

/**
 * アプリ起動時にセッション状態を復元・クリーンアップする Effect。
 *
 * - 期限切れセッション → expireSessionIfNeeded に委譲
 * - 別日のセッション → stale として破棄（Live Activity も終了）
 * - 当日の完了済みセッション → dangling Live Activity を回収
 */
export const restoreSessionOnLaunch = (
  dayBoundaryHour: number,
): Effect.Effect<void, SessionError, AlarmKit | Notification> =>
  Effect.gen(function* () {
    const preState = useMorningSessionStore.getState();
    // records 未ロードのまま expireSessionIfNeeded を通すと、その内部ガードが
    // 「records 待ちで保留」の意味で false を返す。これを「期限切れでない」と
    // 誤解釈して下の stale クリーンアップへ進むと、WakeRecord を更新しない
    // まま（todosCompleted 等が確定しないまま）セッションだけ破棄してしまい、
    // この records ロード失敗が原因で起床結果が永久に失われる
    if (
      preState.session !== null &&
      preState.session.recordId !== null &&
      !useWakeRecordStore.getState().loaded
    ) {
      return;
    }

    const expired = yield* expireSessionIfNeeded;
    if (expired) return;

    const state = useMorningSessionStore.getState();
    if (state.session === null) return;

    // settings 未ロードだと、呼び出し元（_layout.tsx）が渡す dayBoundaryHour は
    // デフォルト値のままの可能性があり、下の stale 判定が誤った論理日付で
    // 有効な永続化済みセッションを別日と誤判定して TODO 進捗ごと破棄してしまう。
    // stale 判定だけを見送り、期限切れ（windowEnd 超過）チェックのみ有効に保つ
    if (!useSettingsStore.getState().loaded) return;

    const now = new Date();
    // tryAutoStartSession は checkSessionWindow（override 考慮の日付解決）で
    // session.date を決めている。ここで単純な論理日付だけを使うと、
    // dayBoundaryHour がアラーム時刻より後の設定では、override 由来の
    // 自動開始セッションを「別日の stale セッション」と誤判定して
    // TODO 進捗ごと破棄してしまう
    const { target } = useWakeTargetStore.getState();
    const today =
      target !== null
        ? resolveOverrideAwareDateStr(now, target, dayBoundaryHour)
        : getLogicalDateString(now, dayBoundaryHour);

    yield* cleanupStaleOrDanglingSession(state, today);
  });

/**
 * session に取り込まれなかったネイティブ先行スヌーズを回収（キャンセル + ID クリア）する。
 *
 * dismiss を起床フローとして処理しない離脱パスで呼ぶ。放置すると管理外の
 * スヌーズが最大 3 時間鳴り続けるか、逆に orphan cancel で実体だけ消えて
 * App Groups に死んだ ID が残り続ける。
 */
const reclaimUnmanagedNativeSnoozes: Effect.Effect<void, never, AlarmKit> = Effect.gen(
  function* () {
    const kit = yield* AlarmKit;
    const nativeIds = yield* kit.getSnoozeAlarmIds;
    if (nativeIds.length === 0) return;
    yield* cancelAlarmsByIds(nativeIds).pipe(Effect.catchAll(() => Effect.void));
    yield* kit.clearSnoozeAlarmIds;
  },
);

/**
 * ネイティブ dismiss イベントを確認し、未処理のものから
 * WakeRecord + セッション情報を復元する Effect。
 *
 * dismiss イベントは復元手段のない一度きりの記録のため、処理できない状況
 * （ストア未ロード）ではイベントを破棄せず false を返し、ロード完了後の
 * 呼び出し（cold-start チェーンや foreground-resume）での再試行に委ねる。
 *
 * @returns true if a session was recovered, false otherwise
 */
export const recoverMissedDismiss = (
  dayBoundaryHour: number,
): Effect.Effect<boolean, SessionError, AlarmKit | Notification> =>
  Effect.gen(function* () {
    const kit = yield* AlarmKit;

    const targetState = useWakeTargetStore.getState();
    const recordState = useWakeRecordStore.getState();
    const sessionState = useMorningSessionStore.getState();
    if (
      !targetState.loaded ||
      targetState.target === null ||
      !recordState.loaded ||
      !sessionState.loaded ||
      !useSettingsStore.getState().loaded
    ) {
      // dayBoundaryHour（設定未ロード時はデフォルト値のまま）で論理日付が
      // ズレると、record/session の重複判定・作成が誤った日付で行われる。
      // session 未ロードのまま進むと isActive()（session !== null）が
      // 常に false になり、実際には dismiss 未処理の可能性があるのに
      // processPrimaryDismissEvent の戻り値だけを見て
      // clearDismissEvents してしまう（handleAlarmDismissEffect 側の
      // session 未ロードガードで record/session 作成自体は行われないため、
      // イベントだけが失われる）
      return false;
    }
    const target = targetState.target;

    // セッションが「アクティブ」でも、tryAutoStartSession による自動開始
    // （recordId 未確定）は dismiss 未処理なので回収へ進む。
    // recordId 確定済みなら dismiss 処理済みで、イベントは重複分として破棄する。
    // このとき App Groups に残る ID はセッション取り込み済み分ではなく
    // （取り込み時に clearSnoozeAlarmIds 済み）、二重 dismiss で新たに積まれた
    // 管理外スヌーズなので、イベントと一緒に回収する
    if (sessionState.isActive() && sessionState.session?.recordId != null) {
      yield* reclaimUnmanagedNativeSnoozes;
      yield* kit.clearDismissEvents;
      return false;
    }

    const events = yield* kit.getDismissEvents;
    if (events.length === 0) return false;

    const primaryEvents = events.filter((e) => !isSnoozeEvent(e));
    if (primaryEvents.length === 0) {
      yield* kit.clearDismissEvents;
      return false;
    }

    // アプリを開かないまま複数の朝にわたって dismiss されると、ネイティブ
    // キューに複数件たまることがある。最後の1件だけ処理してキュー全体を
    // クリアすると、それ以前の日の起床記録が永久に失われる。古い順に
    // 全件処理し、各回で最新の records を見て重複判定する（前の回で
    // 追加された record を次の回の重複判定に反映させるため）
    const sortedEvents = [...primaryEvents].sort((a, b) =>
      a.dismissedAt.localeCompare(b.dismissedAt),
    );
    let recovered = false;
    for (const event of sortedEvents) {
      const currentRecords = useWakeRecordStore.getState().records;
      const result = yield* processPrimaryDismissEvent(
        target,
        event,
        dayBoundaryHour,
        currentRecords,
      );
      recovered = recovered || result;
    }

    yield* kit.clearDismissEvents;
    return recovered;
  });

/**
 * primary dismiss イベント 1 件を起床フローとして処理する。
 * 当日レコード既存・当日 OFF で処理しない場合も、管理外のネイティブ
 * 先行スヌーズは回収してから離脱する。
 *
 * @returns true if the dismiss was processed into a session
 */
const processPrimaryDismissEvent = (
  target: WakeTarget,
  event: { readonly dismissedAt: string },
  dayBoundaryHour: number,
  records: readonly { readonly date: string }[],
): Effect.Effect<boolean, SessionError, AlarmKit | Notification> =>
  Effect.gen(function* () {
    const parsedDismissTime = new Date(event.dismissedAt);
    // dismissedAt が壊れていても回収自体は続行する（時刻は現在で代替）
    const dismissTime = Number.isNaN(parsedDismissTime.getTime()) ? new Date() : parsedDismissTime;
    // tryAutoStartSession は checkSessionWindow（override 考慮）で session.date を
    // 決めている。ここを単純な論理日付のままにすると、override 対象日の dismiss で
    // 既存セッション・レコードとの重複判定がズレ、DismissService 側の
    // resolveOverrideAwareDateStr とも食い違って別日として記録されてしまう
    const dateStr = resolveOverrideAwareDateStr(dismissTime, target, dayBoundaryHour);

    if (records.some((r) => r.date === dateStr)) {
      yield* reclaimUnmanagedNativeSnoozes;
      return false;
    }

    const alarmInstant = resolveDismissInstant(target, dismissTime);
    if (alarmInstant === null) {
      yield* reclaimUnmanagedNativeSnoozes;
      return false;
    }

    yield* handleAlarmDismissEffect({
      target,
      alarmInstant,
      dismissTime,
      mountedAt: dismissTime,
      dayBoundaryHour,
    });

    return true;
  });

/**
 * スヌーズアラーム発火時の処理 Effect。
 * Live Activity のカウントダウンを次のスヌーズ時刻に更新する。
 *
 * @returns true if session is active with incomplete todos, false otherwise
 */
export const handleSnoozeArrivalEffect: Effect.Effect<boolean, AlarmKitError, AlarmKit> =
  Effect.gen(function* () {
    const sessionState = useMorningSessionStore.getState();
    if (sessionState.session === null || sessionState.areAllCompleted()) {
      return false;
    }

    const kit = yield* AlarmKit;
    const nextSnoozeFiresAt = new Date(Date.now() + SNOOZE_DURATION_SECONDS * 1000).toISOString();
    useMorningSessionStore.getState().setSnoozeFiresAt(nextSnoozeFiresAt);

    const activityId = sessionState.session.liveActivityId;
    if (activityId !== null) {
      yield* kit
        .updateLiveActivity(
          activityId,
          sessionState.session.todos.map((t) => ({
            id: t.id,
            title: getLocalizedTodoTitle(t),
            completed: t.completed,
          })),
          Math.floor(new Date(nextSnoozeFiresAt).getTime() / 1000),
        )
        .pipe(Effect.catchAll(() => Effect.void));
    }

    return true;
  });
