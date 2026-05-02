/**
 * 全画面ファイルの render スモークテスト。
 *
 * 背景: `app-screens-import.smoke.test.ts` は default export が関数であることまでしか
 * 確認できず、実際にレンダーした際に投げる例外（初回レンダーで参照する store の不整合 /
 * 子コンポーネントの import 副作用 / useEffect 同期パスの throw）を見逃していた。
 *
 * これらは本番では Expo の errorRecoveryQueue 経由で NSException → SIGABRT に化け、
 * `_dispatch_call_block_and_release` 上で abort() するクラッシュとして観測される。
 * 起動直後のクラッシュループ事故（v1.2.2 build 2 の事象）を CI で検知する目的で追加した。
 *
 * 検知できる範囲:
 *   - 初回レンダー時の同期 throw（コンポーネント本体）
 *   - 初回 useEffect の同期パスでの throw
 *   - 子コンポーネント import 副作用での throw
 *
 * 検知できない範囲（重要）:
 *   - useEffect 内の fire-and-forget Promise の unhandled rejection。
 *     jest 自身が `unhandledRejection` イベントをインターセプトするため、
 *     ユーザーランドの `process.on` には配送されない仕様。
 *     本番のこのパスは Sentry 等のクラッシュレポーティングで検知する想定。
 *
 * 補完関係:
 *   - バンドル時の解決失敗 → CI の `bundle:check`
 *   - モジュール評価時の例外 → `app-screens-import.smoke.test.ts`
 *   - 初回レンダー / useEffect 同期パスの例外（このテスト）
 *   - ユーザー操作時の例外 / async chain の throw → 未カバー（Sentry / Detox 案件）
 */

import { act, render } from '@testing-library/react-native';
import type React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

type ScreenModule = { default: React.ComponentType<unknown> };

const cases: ReadonlyArray<readonly [string, () => ScreenModule]> = [
  ['app/_layout', () => require('../../app/_layout')],
  ['app/(tabs)/_layout', () => require('../../app/(tabs)/_layout')],
  ['app/(tabs)/index', () => require('../../app/(tabs)/index')],
  ['app/(tabs)/settings', () => require('../../app/(tabs)/settings')],
  ['app/onboarding', () => require('../../app/onboarding')],
  ['app/schedule', () => require('../../app/schedule')],
  ['app/target-edit', () => require('../../app/target-edit')],
  ['app/day-review', () => require('../../app/day-review')],
];

// 本番では expo-router の ExpoRoot が SafeAreaProvider を提供する。
// テスト環境でも同等のコンテキストを与えないと useSafeAreaInsets が throw するため、
// ExpoRoot と同じ INITIAL_METRICS を渡してラップする。
const INITIAL_METRICS = {
  frame: { x: 0, y: 0, width: 0, height: 0 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <SafeAreaProvider initialMetrics={INITIAL_METRICS}>{children}</SafeAreaProvider>
);

/**
 * 初回レンダー + 直後の microtask キューを act() で流しきる。
 *
 * 起動シーケンスで async ストアロード → setState が連鎖するため、
 * setImmediate 1 tick 待って初回 useEffect の同期パスまで実行させる。
 * この間に同期 throw が発生すれば呼び出し側に伝播し、テストが fail する。
 */
async function renderAndFlush(Screen: React.ComponentType<unknown>): Promise<void> {
  const view = render(<Screen />, { wrapper: Wrapper });
  await act(async () => {
    await new Promise<void>((resolve) => setImmediate(() => resolve()));
  });
  view.unmount();
}

describe('app/ screen modules — render smoke', () => {
  it.each(cases)('%s renders without throwing', async (_name, loader) => {
    const Screen = loader().default;
    // 同期 throw が起きれば await が reject し、jest がそのまま test を fail にする。
    await renderAndFlush(Screen);
  });
});
