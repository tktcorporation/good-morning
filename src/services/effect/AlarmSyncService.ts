/**
 * アラーム状態の同期を Effect で記述したサービス。
 *
 * 背景: alarm-sync.ts はモジュールスコープの世代カウンターで再入防止していた。
 * Effect 化により Ref を使った構造化された状態管理に置き換え、
 * 依存関係（AlarmKit + ストア状態）が型レベルで明示される。
 *
 * 呼び出し元: wake-target-store（target 変更時）、session-lifecycle（セッション期限切れ後）、_layout.tsx（初期化時）
 */

import { Effect, Ref } from 'effect';
import { useMorningSessionStore } from '../../stores/morning-session-store';
import { useWakeTargetStore } from '../../stores/wake-target-store';
import type { AlarmKit, AlarmKitError } from './AlarmKitService';
import {
  cancelAlarmsByIds,
  cancelAllAlarms,
  scheduleWakeTargetAlarm,
} from './AlarmSchedulerService';

/**
 * 世代カウンター。syncAlarms が非同期処理中に再度呼ばれた場合、
 * 古い呼び出しの結果を破棄して最新の呼び出しだけを反映する。
 *
 * Effect の Ref で管理することで、スレッドセーフに更新できる。
 */
const generationRef = Ref.unsafeMake(0);

/**
 * 現在のストア状態に基づいてアラームを同期する Effect プログラム。
 *
 * - ストア未ロード → 何もしない
 * - target が null/disabled → 全キャンセル
 * - target が enabled → 前回 ID キャンセル → 再スケジュール
 *
 * 世代カウンターで再入防止。処理中に新しい呼び出しが来た場合、
 * 古い結果はキャンセルされて破棄される。
 */
export const syncAlarmsEffect: Effect.Effect<void, AlarmKitError, AlarmKit> = Effect.gen(
  function* () {
    const targetState = useWakeTargetStore.getState();

    if (!targetState.loaded) return;

    const { target } = targetState;
    const generation = yield* Ref.updateAndGet(generationRef, (n) => n + 1);

    if (target === null || !target.enabled) {
      yield* cancelAllAlarms;
      const current = yield* Ref.get(generationRef);
      if (generation === current) {
        yield* Effect.promise(() => targetState.setAlarmIds([]));
      }
      return;
    }

    const previousIds = targetState.alarmIds;
    const snoozeAlarmIds = useMorningSessionStore.getState().session?.snoozeAlarmIds ?? [];
    const newIds = yield* scheduleWakeTargetAlarm(target, previousIds, snoozeAlarmIds);

    const current = yield* Ref.get(generationRef);
    if (generation !== current) {
      // 処理中に新しい syncAlarms が開始された — この結果は古いので破棄
      yield* cancelAlarmsByIds(newIds);
      return;
    }

    yield* Effect.promise(() => targetState.setAlarmIds(newIds));
  },
);
