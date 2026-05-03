/**
 * 全画面ファイルの import スモークテスト。
 *
 * 背景: 「起動直後にクラッシュする」事故の主要因は、画面ファイルの
 * トップレベル import が解決できない／import 副作用で例外が出る、という
 * バンドル後ではなくモジュール評価時に起きる失敗。
 *
 * 既存の単体テストは store / service の純粋ロジックのみで、画面ファイル自体は
 * 一度も評価されていなかったため、未使用 import の typo や、削除したヘルパーへの
 * 参照といった問題が CI を素通りしていた。
 *
 * このテストは画面の default export を関数として確認するだけ。レンダーまでは
 * しない（jest-expo preset への移行が必要なため別途検討）が、最低限
 * 「モジュールが評価できる」ことだけは保証する。
 *
 * 補完関係:
 *   - バンドル時の解決失敗 → CI の `bundle:check` ジョブが検知
 *   - モジュール評価時の例外 → このテストが検知
 *   - レンダー時の useEffect 例外 → 未カバー（将来 testing-library で対応予定）
 */

describe('app/ screen modules — import smoke', () => {
  const cases: ReadonlyArray<readonly [string, () => unknown]> = [
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

  it.each(cases)('%s loads without throwing and default-exports a function', (_name, loader) => {
    const mod = loader() as { default?: unknown };
    expect(typeof mod.default).toBe('function');
  });
});
