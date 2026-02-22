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
- `pnpm test` - テスト実行
- `pnpm lint` - Biome lint チェック
- `pnpm lint:fix` - lint 自動修正
- `pnpm format` - コードフォーマット
- `pnpm typecheck` - TypeScript 型チェック

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

## Version Control
- jj (Jujutsu) を使用（Git の代わりに）
- `git add` / `git commit` は使わない。jj が変更を自動追跡する
- `jj commit -m "message"` でコミット、`jj git push` でプッシュ
- 詳細は `.claude/rules/jujutsu.md` を参照

## Development
- Node.js 22 (mise で管理)
- pnpm 10 (mise で管理)
- jj 0.38+ (mise で管理)
- DevContainer サポートあり
