# Good Morning - iOS Alarm App

タスクベースの起床フローを持つiOSアラームアプリ。

## Tech Stack
- Expo SDK 54 / React Native 0.81 / React 19
- TypeScript (strict mode)
- Expo Router (file-based routing)
- Zustand (state management)
- Biome (linting/formatting)
- Jest (testing)
- pnpm (package manager)

## Commands
- `pnpm start` - Expo dev server 起動
- `pnpm ios` - Debug ビルド（dev server 接続必須）
- `pnpm ios:release` - Release ビルドを実機にインストール（dev server 不要、スタンドアロン動作）
- `pnpm test` - テスト実行
- `pnpm lint` - Biome lint チェック
- `pnpm lint:fix` - lint 自動修正
- `pnpm format` - コードフォーマット
- `pnpm typecheck` - TypeScript 型チェック

## iOS ビルド方法

### dev server 不要のスタンドアロンビルド（実機向け）

```bash
# 1. IPA をビルド（初回は数分かかる）
pnpm ios:local

# 2. 生成された IPA をデバイスにインストール
pnpm ios:install ./build-*.ipa
```

- `expo-dev-client` を含まない Ad Hoc 配布ビルドを生成するため、dev server なしで起動できる
- `eas build --local --non-interactive` をローカルで実行（EAS クラウド不使用）
- eas-cli は mise で管理（`npm:eas-cli = "latest"` in `.mise.toml`）
- インストールには CoreDevice ID `DB40A4CE-4A0A-550C-B53C-747D13F5D320`（`xcrun devicectl list devices` で確認）
- IPA は `./build-*.ipa` として生成される

> **注意**: `pnpm ios:release`（`expo run:ios --configuration Release`）は expo-dev-client が含まれるため、
> dev server なしで起動すると "No development servers found" 画面が出る。スタンドアロン動作には `ios:local` を使うこと。

### 開発中の通常フロー（hot reload あり）

```bash
pnpm start   # Metro dev server 起動
pnpm ios     # Debug ビルドで実機/シミュレータに接続
```

## Project Structure
- `app/` - Expo Router スクリーン (file-based routing)
  - `(tabs)/` - タブナビゲーション
  - `alarm/` - アラーム作成・編集
  - `wakeup/` - 起床フロー
- `src/components/` - 再利用可能なUIコンポーネント
- `src/constants/` - テーマ・定数
- `src/services/` - 通知・サウンドサービス
- `src/stores/` - Zustand ストア
- `src/types/` - TypeScript 型定義
- `src/__tests__/` - ユニットテスト

## Conventions
- pnpm を使用 (npm, yarn は使わない)
- Biome でリント・フォーマット (ESLint/Prettier は使わない) — 設定は biome.json を参照
- パスエイリアス: `@/*` は `./src/*` にマッピング
- Strict TypeScript — 設定は tsconfig.json を参照
- コードの意図(WHY)を記録する — 詳細は `.claude/rules/code-intent-documentation.md` を参照

## Version Control
- jj (Jujutsu) を使用（Git の代わりに）
- `git add` / `git commit` は使わない。jj が変更を自動追跡する
- `jj commit -m "message"` でコミット、`jj git push` でプッシュ
- 詳細は `.claude/rules/jujutsu.md` を参照

## Pre-push Checklist

**プッシュ前に以下を全て実行し、エラーがないことを確認すること。**
CI で落ちる修正を防ぐため、1つでも失敗したらプッシュしない。

```bash
pnpm typecheck                          # 型チェック
pnpm lint                               # Biome lint
pnpm biome format .                     # フォーマットチェック
pnpm test                               # テスト実行
npx expo install --check                # Expo 依存パッケージの互換性
pnpm changeset status --since=origin/main  # changeset の有無（コード変更時は必須）
```

- changeset が必要な場合: `pnpm changeset` で追加（対話式）
- コード変更を含まない場合: `pnpm changeset --empty` でスキップ可能
- Expo 依存の不整合: `npx expo install --fix` で自動修正

## Development
- Node.js 22 (mise で管理)
- pnpm 10 (mise で管理)
- jj 0.38+ (mise で管理)
- DevContainer サポートあり
