/**
 * Provider 系ライブラリの多重インストールを検知する。
 *
 * 背景: React Context は `React.createContext()` を呼んだインスタンスごとに別物。
 * 同じパッケージが node_modules に 2 バージョン入ると、Provider 側と
 * useContext 側で別の Context オブジェクトを参照してしまい、
 * 「useFoo must be used within a FooProvider」系のクラッシュが起動時に発生する。
 *
 * 過去事例: `@react-navigation/elements` が 2.9.8 / 2.9.10 で重複し、
 * `BottomTabBar`（古い側）が `useFrameSize` で throw、`SafeAreaProviderCompat`（新しい側）の
 * `FrameSizeProvider` を見つけられない、というクラッシュを iOS で起こした。
 *
 * このテストは `pnpm list` を解析して、Provider を提供する代表的なパッケージが
 * 単一バージョンに揃っているかを確認する。重複が出たら `pnpm.overrides` で
 * バージョンを統一すること。
 */

import { execFileSync } from 'node:child_process';

type PnpmListEntry = {
  readonly name?: string;
  readonly version?: string;
  readonly dependencies?: Record<string, PnpmListEntry>;
  readonly devDependencies?: Record<string, PnpmListEntry>;
};

function collectVersions(
  tree: PnpmListEntry,
  target: string,
  acc: Set<string>,
  seen: Set<PnpmListEntry>,
): void {
  if (seen.has(tree)) return;
  seen.add(tree);

  for (const group of [tree.dependencies, tree.devDependencies] as const) {
    if (!group) continue;
    for (const [name, entry] of Object.entries(group)) {
      if (!entry) continue;
      if (name === target && entry.version) {
        acc.add(entry.version);
      }
      collectVersions(entry, target, acc, seen);
    }
  }
}

function getInstalledVersions(packageName: string): readonly string[] {
  // `pnpm list --depth Infinity --json` は依存ツリー全体を JSON で返す。
  // 単一パッケージの全実体バージョンを集めるのに使う。
  const stdout = execFileSync('pnpm', ['list', '--depth', 'Infinity', '--json', packageName], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const parsed = JSON.parse(stdout) as readonly PnpmListEntry[];
  const versions = new Set<string>();
  for (const root of parsed) {
    collectVersions(root, packageName, versions, new Set());
  }
  return [...versions].sort();
}

describe('Provider を提供するパッケージの重複検知', () => {
  // React Context を export するパッケージ。同じ名前で複数バージョンが入ると
  // Context インスタンスが分離して Provider/Hook の整合が壊れる。
  const PROVIDER_PACKAGES = [
    '@react-navigation/elements',
    '@react-navigation/native',
    '@react-navigation/core',
    'react-native-safe-area-context',
    'react',
    'react-native',
  ] as const;

  it.each(PROVIDER_PACKAGES)('%s は単一バージョンのみインストールされている', (pkg) => {
    const versions = getInstalledVersions(pkg);
    if (versions.length > 1) {
      throw new Error(
        `${pkg} が複数バージョンインストールされています: ${versions.join(', ')}\n` +
          `Context が分離してランタイムクラッシュを引き起こす可能性があります。\n` +
          `package.json の "pnpm.overrides" でバージョンを統一してください。`,
      );
    }
    expect(versions.length).toBeLessThanOrEqual(1);
  }, 30_000);
});
