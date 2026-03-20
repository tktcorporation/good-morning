/**
 * レガシーサービスとの互換ラッパー関数。
 *
 * 背景: 従来の alarm-kit.ts / sound.ts が提供していた async/sync 関数を
 * Effect サービス経由で再提供する。app 画面や設定画面など React コンポーネントから
 * runEffect() を直接呼ばずに済むよう、使い慣れたインターフェースを維持する。
 *
 * 段階的移行が完了し、全呼び出し元が Effect プログラムを直接組み立てるようになれば、
 * このファイルは不要になる。
 */

import { Effect } from 'effect';
import { AlarmKit } from './AlarmKitService';
import { runEffect } from './runtime';

// ─── AlarmKit 互換関数 ─────────────────────────────────────────

/**
 * AlarmKit の認可をリクエストし、App Group を設定する。
 *
 * 背景: permissions.ts のオンボーディング・設定画面から呼ばれる。
 * Effect の AlarmKit.initialize を async 関数として提供する。
 *
 * 呼び出し元: src/constants/permissions.ts
 */
export async function initializeAlarmKit(): Promise<'authorized' | 'denied'> {
  try {
    return await runEffect(
      Effect.gen(function* () {
        const kit = yield* AlarmKit;
        return yield* kit.initialize;
      }),
    );
  } catch {
    return 'denied';
  }
}

/**
 * AlarmKit ネイティブモジュールが利用可能かどうかを返す。
 *
 * expo-alarm-kit を遅延ロードし、require に成功すれば true。
 * AlarmKitService と同じモジュールを参照するため結果は一致する。
 *
 * 呼び出し元: app/(tabs)/index.tsx (AlarmKit未対応バナーの表示判定)
 */
export function isAlarmKitAvailable(): boolean {
  try {
    require('expo-alarm-kit');
    return true;
  } catch {
    return false;
  }
}

/**
 * アプリ起動時のペイロードを同期的に取得する。
 * AlarmKit 経由の起動かどうかの判定に使用。
 *
 * 背景: _layout.tsx の初期化で、どのストアを待つかの判定に使う。
 * handleAlarmEventEffect 内でも kit.checkLaunchPayload が呼ばれるが、
 * こちらは Effect ランタイム外で同期的に呼ぶ必要がある。
 *
 * 呼び出し元: app/_layout.tsx (初期化時の最適化)
 */
export function checkLaunchPayload(): { alarmId: string; payload: string | null } | null {
  try {
    // biome-ignore lint/suspicious/noExplicitAny: expo-alarm-kit has no exported type for the module
    const kit = require('expo-alarm-kit') as any;
    return kit.getLaunchPayload() as { alarmId: string; payload: string | null } | null;
  } catch {
    return null;
  }
}
