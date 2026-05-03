/**
 * 全画面ファイルのレンダースモークテスト。
 *
 * 背景: import スモークテスト（app-screens-import.smoke.test.ts）は
 * モジュール評価時の例外しか検知できず、コンポーネントを呼び出した瞬間や
 * 初回 useEffect の同期部分で throw する不具合を素通りさせていた。
 * 「アプリが起動直後にクラッシュする」問題はこのレイヤで起きるため、
 * react-test-renderer で実際にマウントして「描画が落ちないこと」だけを保証する。
 *
 * このテストはレンダー成功＝useEffect が同期的に投げない、を担保するもので、
 * useEffect の非同期処理結果の妥当性までは見ない。
 */

import type React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// react-test-renderer は jest-expo preset が依存として持つため runtime には居るが、
// 型定義は配布されていない。ここでは any 経由で読み込む。
// biome-ignore lint/suspicious/noExplicitAny: runtime-only module without published types
const TestRenderer = require('react-test-renderer') as any;
const { act } = TestRenderer;

const cases: ReadonlyArray<readonly [string, () => { default: React.ComponentType<unknown> }]> = [
  ['app/_layout', () => require('../../app/_layout')],
  ['app/(tabs)/_layout', () => require('../../app/(tabs)/_layout')],
  ['app/(tabs)/index', () => require('../../app/(tabs)/index')],
  ['app/(tabs)/settings', () => require('../../app/(tabs)/settings')],
  ['app/onboarding', () => require('../../app/onboarding')],
  ['app/schedule', () => require('../../app/schedule')],
  ['app/target-edit', () => require('../../app/target-edit')],
  ['app/day-review', () => require('../../app/day-review')],
  ['app/squat-check', () => require('../../app/squat-check')],
];

// 実アプリでは expo-router が NavigationContainer 経由で SafeAreaProvider を
// 自動マウントする (@react-navigation/elements の SafeAreaProviderCompat)。
// テスト環境ではそのチェーンが無いため、画面が useSafeAreaInsets() を呼ぶケースに
// 対応するためここで明示的に被せる。
const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

// CI runner はローカルより著しく遅く、_layout 系の useEffect 内で
// `Promise.all([loadSession, loadTarget, ...])` を待つため
// jest のデフォルト 5s では timeout する。
// このスモークの主目的は「同期的 throw を検知すること」であり、
// 非同期の effect の完了時間まで縛りたいわけではないので余裕を持って 30s に。
jest.setTimeout(30_000);

describe('app/ screen modules — render smoke', () => {
  it.each(cases)('%s renders without throwing', async (_name, loader) => {
    const Component = loader().default;
    // biome-ignore lint/suspicious/noExplicitAny: react-test-renderer types are not published
    let tree: any = null;
    await act(async () => {
      tree = TestRenderer.create(
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <Component />
        </SafeAreaProvider>,
      );
    });
    expect(tree).not.toBeNull();
    await act(async () => {
      tree?.unmount();
    });
  });
});
