# Changeset + EAS リリースビルド設計

## 背景

現在 `eas-build.yml` は main への全 push で EAS ビルド/OTA update を実行している。
バージョン管理が手動で、リリースタイミングの制御ができない。

## 目的

- Changesets でバージョン管理を自動化
- EAS ビルドをリリース（Version PR マージ）時のみに限定
- PR に changeset ファイルが含まれているかを CI で検証

## リリースフロー

```
機能 PR (changeset ファイル付き) → main マージ
    ↓
changesets/action が "Version Packages" PR を自動作成
    ↓
"Version Packages" PR をマージ → package.json version 更新
    ↓
release.yml が published=true を検知 → EAS Build 実行
```

## 変更内容

### 新規ファイル

1. `.changeset/config.json` — changeset 設定
2. `.github/workflows/release.yml` — changeset → EAS ビルドの統合ワークフロー
3. `.github/workflows/changeset-check.yml` — PR で changeset 有無を検証

### 変更ファイル

4. `package.json` — devDependencies + scripts 追加

### 削除ファイル

5. `.github/workflows/eas-build.yml` — release.yml に統合

## 設計詳細

### .changeset/config.json

- `changelog`: `@changesets/changelog-github` (PR リンク付き changelog)
- `commit`: false (Version PR 方式)
- `baseBranch`: main
- `privatePackages`: `{ "version": true, "tag": true }` (private パッケージでもバージョン & タグ)

### release.yml

- トリガー: push to main
- Job 1 (changesets): changesets/action で version PR 作成 or published 検知
- Job 2 (eas-build): published=true の時のみ、fingerprint チェック → EAS Build or Update

### changeset-check.yml

- トリガー: pull_request
- changeset ファイルが存在するか検証
- docs/config のみの変更は changeset 不要（`--empty` で明示的にスキップ可能）

### package.json 追加

```json
{
  "scripts": {
    "changeset": "changeset",
    "version-packages": "changeset version"
  },
  "devDependencies": {
    "@changesets/changelog-github": "^0.5.2",
    "@changesets/cli": "^2.29.8"
  }
}
```
