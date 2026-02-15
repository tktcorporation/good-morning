# GitHub Actions ワークフローファイル

ここにあるファイルは `.github/workflows/` に配置して使う GitHub Actions ワークフローです。

## セットアップ手順

### 1. eas.json の確認

プロジェクトルートの `eas.json` が配置済みです。

### 2. Expo アカウントとプロジェクトの紐付け

ローカル PC で一度だけ実行:

```bash
# Expo にログイン
npx eas-cli login

# プロジェクトを EAS に登録
npx eas-cli build:configure
```

### 3. iOS デバイスの登録 (iOS ビルドする場合)

Apple Developer Program ($99/年) への加入が必要です。

```bash
# iPhone の UDID を登録 (リンクが発行されるのでiPhoneで開く)
npx eas-cli device:create
```

### 4. GitHub Secrets の設定

1. https://expo.dev のアカウント設定で Access Token を発行
2. GitHub リポジトリの Settings > Secrets and variables > Actions で `EXPO_TOKEN` を追加

### 5. ワークフローファイルの配置

```bash
mkdir -p .github/workflows
cp _github-actions/eas-build.yml .github/workflows/eas-build.yml
```

### 6. 動作確認

main ブランチに push すると自動でビルドが走ります。
ビルド完了後、https://expo.dev のダッシュボードからインストールリンクを取得できます。

## ファイル一覧

| ファイル | 説明 |
|---------|------|
| `eas-build.yml` | push 時に EAS Build (内部配布) を実行するワークフロー |
