/**
 * アラーム状態の同期を一元管理するモジュール。
 *
 * 背景: アラーム再スケジュールが _layout.tsx の React useEffect（受動的）と
 * completeMorningSession の直接呼び出し（能動的）の二重パスで行われていた。
 * target が変更されるたびに effect が発火し、タイミング次第で
 * セッション中のスヌーズアラームが巻き添えキャンセルされる競合状態があった。
 *
 * 設計変更（2026-03）: scheduleWakeTargetAlarm が ID ベースキャンセルに変更されたため、
 * セッションアクティブ中でも安全に呼べるようになった。
 * 旧: cancelAllAlarms → スヌーズ巻き添え → セッションアクティブガードが必要
 * 新: cancelAlarmsByIds(previousIds) → スヌーズに影響しない → ガード不要
 *
 * 呼び出し元:
 *   - wake-target-store.ts: target 変更時（時刻・曜日・有効/無効・サウンド等）
 *   - session-lifecycle.ts: expireSessionIfNeeded（セッション期限切れ後の再スケジュール）
 *   - _layout.tsx: アプリ起動時（cold-start 後のアラーム確保）
 */

import { useMorningSessionStore } from '../stores/morning-session-store';
import { useWakeTargetStore } from '../stores/wake-target-store';
import { cancelAlarmsByIds, cancelAllAlarms, scheduleWakeTargetAlarm } from './alarm-scheduler';

/**
 * 世代カウンター。syncAlarms が非同期処理中に再度呼ばれた場合、
 * 古い呼び出しの結果を破棄して最新の呼び出しだけを反映するために使う。
 * _layout.tsx の cancelled フラグと同等の仕組みだが、関数スコープに閉じない分
 * 複数の呼び出し元から安全に使える。
 */
let currentGeneration = 0;

/**
 * 現在のストア状態に基づいてアラームを同期する。
 *
 * 判定ロジック:
 * - ストア未ロード → 何もしない（初期化完了後に再呼出される）
 * - target が null/disabled → 全アラームキャンセル
 * - target が enabled → 前回の wake-target ID のみキャンセル → 再スケジュール
 *
 * セッションアクティブ中でも安全に呼べる。scheduleWakeTargetAlarm が
 * ID ベースキャンセルに変更されたため、スヌーズアラームには影響しない。
 *
 * 再入防止: 世代カウンターにより、処理中に新しい呼び出しが開始された場合、
 * 古い呼び出しの結果（新規登録したアラーム ID）をキャンセルして破棄する。
 * これにより target の連続変更時に中間状態のアラームが残る問題を防ぐ。
 */
export async function syncAlarms(): Promise<void> {
  const targetState = useWakeTargetStore.getState();

  // ストア未ロード時は何もしない。
  // アプリ起動時は _layout.tsx の init effect が loadTarget 完了後に syncAlarms を呼ぶ。
  if (!targetState.loaded) return;

  const { target } = targetState;
  const generation = ++currentGeneration;

  if (target === null || !target.enabled) {
    // target 無効時は全アラームキャンセル。
    // セッションアクティブ中に target を無効にすることは通常ないが、
    // 万が一のケースではスヌーズも含めて全停止が適切。
    await cancelAllAlarms();
    if (generation === currentGeneration) {
      await targetState.setAlarmIds([]);
    }
    return;
  }

  // 前回の wake-target ID とアクティブなスヌーズ ID を渡す。
  // scheduleWakeTargetAlarm は wake-target のみキャンセルし、スヌーズには触れない。
  const previousIds = targetState.alarmIds;
  const snoozeAlarmIds = useMorningSessionStore.getState().session?.snoozeAlarmIds ?? [];
  const newIds = await scheduleWakeTargetAlarm(target, previousIds, snoozeAlarmIds);

  if (generation !== currentGeneration) {
    // 処理中に新しい syncAlarms が開始された — この結果は古いので破棄
    await cancelAlarmsByIds(newIds);
    return;
  }

  await targetState.setAlarmIds(newIds);
}
