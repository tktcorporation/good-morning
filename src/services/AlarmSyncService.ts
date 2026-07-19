/**
 * アラーム状態の同期を Effect で記述したサービス。
 *
 * 呼び出し元: wake-target-store（target 変更時）、session-lifecycle（セッション期限切れ後）、_layout.tsx（初期化時）
 */

import { Effect, Ref } from 'effect';
import { useMorningSessionStore } from '../stores/morning-session-store';
import { useWakeRecordStore } from '../stores/wake-record-store';
import { useWakeTargetStore } from '../stores/wake-target-store';
import type { AlarmKit, AlarmKitError } from './AlarmKitService';
import { cancelAlarmsExcept, scheduleWakeTargetAlarm } from './AlarmSchedulerService';

/**
 * 同期処理の直列化用セマフォ。
 *
 * syncAlarms は「キャンセル → 登録」の複合操作で、target 変更・cold-start・
 * セッション期限切れなど複数の経路から fire-and-forget で起動される。
 * 並行実行を許すと、古い実行の孤立アラーム掃除が新しい実行の登録済み
 * アラームを「孤立」と誤認して取り消し、ストアは登録済みのつもりなのに
 * 実アラームが 0 本（翌朝鳴らない）という不整合が起きる。
 */
const syncSemaphore = Effect.unsafeMakeSemaphore(1);

/**
 * 世代カウンター。セマフォ待ちの間に新しい同期要求が来た場合、
 * 古い要求はクリティカルセクション内で何もせずスキップする
 * （どの実行もストアの最新状態を読むため、最後の 1 回だけ走れば十分）。
 */
const generationRef = Ref.unsafeMake(0);

/**
 * 現在のストア状態に基づいてアラームを同期する Effect プログラム。
 *
 * - ストア未ロード → 何もしない
 * - target が null/disabled → セッションのスヌーズ以外を全キャンセル
 * - target が enabled → 再スケジュール（成功後に旧アラームを掃除）
 *
 * スケジュール失敗時は store の alarmIds を更新しない。
 * scheduleWakeTargetAlarm が旧アラームをネイティブに温存するため、
 * 旧 ID を保持し続けるのが実態と一致する。
 *
 * records / session 未ロードでもスキップする: 孤立掃除の keep 対象は
 * session.snoozeAlarmIds だが、これはストアが未ロードだと必ず null
 * （＝空扱い）になる。records は dismiss 処理側が未ロード時に
 * WakeRecord・セッション作成を諦める（履歴上書き防止のため）ので、
 * その状態のまま sync するとセッションに取り込まれていないネイティブ
 * 先行スヌーズを孤立として消す。session 自体が未ロードの場合も同様に、
 * 永続化済みの進行中セッションが持つスヌーズを「存在しない」ものとして
 * 扱ってしまい、同じく孤立キャンセルの対象にしてしまう。
 */
export const syncAlarmsEffect: Effect.Effect<void, AlarmKitError, AlarmKit> = Effect.gen(
  function* () {
    const myGeneration = yield* Ref.updateAndGet(generationRef, (n) => n + 1);

    yield* syncSemaphore.withPermits(1)(
      Effect.gen(function* () {
        const latest = yield* Ref.get(generationRef);
        if (myGeneration !== latest) return;

        const targetState = useWakeTargetStore.getState();
        const sessionState = useMorningSessionStore.getState();
        if (!(targetState.loaded && useWakeRecordStore.getState().loaded && sessionState.loaded)) {
          return;
        }

        const { target } = targetState;
        const snoozeAlarmIds = sessionState.session?.snoozeAlarmIds ?? [];

        if (target === null || !target.enabled) {
          // wake-target の無効化は「将来の朝」の設定変更。進行中の起床フローの
          // スヌーズ（ネイティブ先行スケジュール済み）まで殺すと、
          // 二度寝したユーザーを起こす手段がなくなるため温存する
          yield* cancelAlarmsExcept(snoozeAlarmIds);
          yield* Effect.promise(() => targetState.setAlarmIds([]));
          return;
        }

        const previousIds = targetState.alarmIds;
        const newIds = yield* scheduleWakeTargetAlarm(target, previousIds, snoozeAlarmIds);
        yield* Effect.promise(() => targetState.setAlarmIds(newIds));
      }),
    );
  },
);
