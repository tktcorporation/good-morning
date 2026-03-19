# Pre-push Checklist ルール

## 絶対に守ること

**`git push` / `jj git push` を実行する前に、以下の全チェックを実行し、全て通ることを確認すること。**
**1つでも失敗していたらプッシュしてはならない。**

```bash
pnpm typecheck                          # 型チェック — エラー 0 であること
pnpm lint                               # Biome lint — エラー 0 であること（warning は許容）
pnpm biome format .                     # フォーマット — "No fixes applied" であること
pnpm test                               # テスト — 全テスト pass であること
npx expo install --check                # Expo 依存 — "Dependencies are up to date" であること
pnpm changeset status --since=origin/main  # changeset — エラーでないこと
```

## 修正方法

- **Expo 依存の不整合**: `npx expo install --fix` で自動修正
- **changeset が必要**: `pnpm changeset` で対話式に追加
- **lint/format エラー**: `pnpm lint:fix && pnpm format` で自動修正

## なぜ重要か

- CI で落ちる修正を防ぐ
- レビュアーの時間を無駄にしない
- 「プッシュしてから直す」は絶対にやらない

## チェック結果の報告

プッシュ前に、全チェック結果を以下の形式でユーザーに報告すること：

```
| チェック | 結果 |
|---------|------|
| typecheck | ✅ 通過 |
| lint | ✅ 0エラー |
| format | ✅ 通過 |
| test | ✅ N テスト全通過 |
| expo install --check | ✅ up to date |
| changeset status | ✅ あり |
```
