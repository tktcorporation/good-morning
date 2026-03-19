/**
 * ウィジェットデータの組み立てと同期を Effect で記述したサービス。
 *
 * 背景: widget-sync.ts は全ストアから直接 getState() で値を取り、
 * AlarmKit の関数を fire-and-forget で呼んでいた。Effect 化により
 * AlarmKit への依存が型レベルで明示され、エラーが追跡される。
 *
 * buildWidgetData は純粋関数のため Effect 不要。syncWidget のみ Effect 化。
 *
 * 呼び出し元: ストアの変更コールバック、background-sync、_layout.tsx
 */

import { Effect } from 'effect';
import { buildWidgetData } from '../widget-sync';
import { AlarmKit, type AlarmKitError } from './AlarmKitService';

/**
 * ウィジェットデータを組み立てて App Groups に同期し、タイムラインを更新する Effect。
 *
 * 従来の syncWidget() と同等だが、エラーが AlarmKitError として型追跡される。
 * 呼び出し元が catchAll / catchTag でハンドリング戦略を選択できる。
 */
export const syncWidgetEffect: Effect.Effect<void, AlarmKitError, AlarmKit> = Effect.gen(
  function* () {
    const kit = yield* AlarmKit;
    const data = buildWidgetData();
    yield* kit.syncWidgetData(JSON.stringify(data));
    yield* kit.reloadWidgetTimelines;
  },
);
