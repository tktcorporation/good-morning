/**
 * アラーム状態の同期を一元管理するモジュール。
 *
 * 背景: アラーム再スケジュールが _layout.tsx の React useEffect（受動的）と
 * completeMorningSession の直接呼び出し（能動的）の二重パスで行われていた。
 * target が変更されるたびに effect が発火し、タイミング次第で
 * セッション中のスヌーズアラームが巻き添えキャンセルされる競合状態があった。
 *
 * 設計: React のリアクティブモデルからアラーム管理を分離する。
 * target を変更するストアメソッドが明示的に syncAlarms() を呼ぶことで、
 * アプリの状態（フォアグラウンド/バックグラウンド/終了後）に依存しない
 * 一貫したスケジューリングを実現する。
 *
 * 呼び出し元:
 *   - wake-target-store.ts: target 変更時（時刻・曜日・有効/無効・サウンド等）
 *   - session-lifecycle.ts: completeMorningSession（セッション完了後の再スケジュール）
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
 * - セッションアクティブ中 → 何もしない（スヌーズが管理中）
 * - ストア未ロード → 何もしない（初期化完了後に再呼出される）
 * - target が null/disabled → 全アラームキャンセル
 * - target が enabled → 全アラームキャンセル → 再スケジュール
 *
 * 再入防止: 世代カウンターにより、処理中に新しい呼び出しが開始された場合、
 * 古い呼び出しの結果（新規登録したアラーム ID）をキャンセルして破棄する。
 * これにより target の連続変更時に中間状態のアラームが残る問題を防ぐ。
 */
export async function syncAlarms(): Promise<void> {
  // セッションアクティブ中はスヌーズアラームが session-lifecycle で管理されている。
  // cancelAllAlarms で巻き添えキャンセルされるのを防ぐ。
  if (useMorningSessionStore.getState().isActive()) return;

  const targetState = useWakeTargetStore.getState();

  // ストア未ロード時は何もしない。
  // アプリ起動時は _layout.tsx の init effect が loadTarget 完了後に syncAlarms を呼ぶ。
  if (!targetState.loaded) return;

  const { target } = targetState;
  const generation = ++currentGeneration;

  if (target === null || !target.enabled) {
    await cancelAllAlarms();
    if (generation === currentGeneration) {
      await targetState.setAlarmIds([]);
    }
    return;
  }

  // scheduleWakeTargetAlarm は内部で cancelAllAlarms → 再スケジュールする。
  const newIds = await scheduleWakeTargetAlarm(target);

  if (generation !== currentGeneration) {
    // 処理中に新しい syncAlarms が開始された — この結果は古いので破棄
    await cancelAlarmsByIds(newIds);
    return;
  }

  await targetState.setAlarmIds(newIds);
}
