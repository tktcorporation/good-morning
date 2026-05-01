/**
 * 全画面ファイルの render スモークテスト。
 *
 * 背景: `app-screens-import.smoke.test.ts` は default export が関数であることまでしか
 * 確認できず、render 時に投げる例外（useEffect / 初回レンダーで参照する store の不整合 /
 * 子コンポーネントの import 副作用）を見逃していた。
 *
 * これらは本番では Expo の errorRecoveryQueue 経由で NSException → SIGABRT に化け、
 * `_dispatch_call_block_and_release` 上で abort() するクラッシュとして観測される。
 * 起動直後のクラッシュループ事故（v1.2.2 build 2 の事象）を CI で検知する目的で追加した。
 *
 * 補完関係:
 *   - バンドル時の解決失敗 → CI の `bundle:check`
 *   - モジュール評価時の例外 → `app-screens-import.smoke.test.ts`
 *   - 初回レンダー時の例外（このテスト） → render 後 act() で初回 useEffect まで流す
 *   - ユーザー操作時の例外 → 未カバー（必要に応じて画面別テストを追加）
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
 * 初回レンダー + 直後の非同期マイクロタスクまでを act() で流しきる。
 *
 * 本番クラッシュ（Expo errorRecoveryQueue 経由の NSException）の典型は、
 * - useEffect 内で起動された Promise チェーンが unhandled rejection になる
 * - そのまま native ブリッジまで突き抜ける
 * というパス。同期 throw だけを見ていると検知できないため、
 * マイクロタスクと setImmediate を流し終えるまで待つ。
 */
async function renderAndFlush(Screen: React.ComponentType<unknown>): Promise<void> {
  const view = render(<Screen />, { wrapper: Wrapper });
  // 起動シーケンスで async ストアロード → setState が連鎖するため、
  // すべての pending な microtask を流すまで待つ。
  await act(async () => {
    await new Promise<void>((resolve) => setImmediate(() => resolve()));
  });
  view.unmount();
}

describe('app/ screen modules — render smoke', () => {
  it.each(cases)('%s renders without throwing', async (_name, loader) => {
    const Screen = loader().default;
    // 同期 throw も async unhandled rejection も上に伝播させて検出する。
    await expect(renderAndFlush(Screen)).resolves.not.toThrow();
  });
});
