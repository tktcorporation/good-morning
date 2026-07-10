# リリース運用ガイド

## 仕組み

```
PR マージ (changeset 付き)
  → main push で Release workflow の changesets ジョブが "Version Packages" PR を作成
  → Version PR をマージ
  → changesets ジョブが git tag を作成し published=true を出力
  → eas-build ジョブが実行:
      - fingerprint が一致する完了済みビルドが EAS にあれば → eas update (OTA) のみ
      - なければ → eas build --profile preview (internal distribution) でフルビルド
```

- `runtimeVersion` は fingerprint ポリシー（`app.config.ts`）。ネイティブに影響する変更
  （依存追加・ネイティブ設定変更・パッチ等）は fingerprint が変わり、フルビルドになる。
- 判定に使う runtimeVersion は `pnpm exec expo-updates runtimeversion:resolve --platform ios`
  で解決する。expo-updates 自身の解決ロジックを使うため、EAS が実際にビルド・update に
  付与する値と構造的に一致する（独自に fingerprint を計算すると platform 範囲や
  ライブラリバージョンの差でずれる）。

## ネイティブターゲットを追加したとき（必須の一回限り作業）

Widget / App Extension などの新しいネイティブターゲット（`targets/` 配下）を追加すると、
そのターゲット用の Provisioning Profile が EAS サーバー上に存在しないため、
CI の非対話ビルドは **必ず失敗する**。非対話モードの eas-cli は Apple 認証を行わず、
新規 credentials を生成できない（既存 credentials の再利用のみ可能）。

Native Target Guard ワークフローが新規ターゲットの追加を検出して PR を fail させる。
**対象 PR をマージする前に**、ローカルで一度だけ対話モードで credentials を登録し、
完了後に PR へ `eas-credentials-registered` ラベルを付けてチェックを通過させる:

```bash
eas login                              # 未ログインの場合
eas credentials --platform ios        # profile: preview → 新ターゲットの Provisioning Profile をセットアップ
# または: eas build --platform ios --profile preview を対話実行
# （credentials 登録後にクラウドビルドが始まるので、不要ならキャンセルしてよい）
```

Apple 認証は Apple ID ログインか、App Store Connect API Key
（`EXPO_ASC_KEY_ID` / `EXPO_ASC_ISSUER_ID` / `EXPO_ASC_API_KEY_PATH` 環境変数）が使える。
登録されたか確認:

```bash
eas credentials --platform ios   # 各ターゲットに Ad Hoc プロファイルが表示されること
```

## リリースが失敗したときの回収手順

### パターン A: eas-build ジョブが失敗した（タグは作成済み）

原因を修正した後、**失敗した run の「Re-run failed jobs」** で eas-build だけ再実行する:

```bash
gh run rerun <run-id> --failed
```

- changesets ジョブの `published=true` output は前回 attempt から引き継がれるため、
  再実行でもビルドが走る。タグの二重作成は起きない。
- 新しく workflow を起動し直すと changeset は消費済みのため `published=false` になり、
  eas-build はスキップされる（このパターンでは Re-run を使うこと）。

### パターン B: run が再実行できない（期限切れ・キャンセル等）

Release workflow を **workflow_dispatch** で起動し、`force_eas_build` にチェックを
入れる。changesets の publish 判定を経由せず eas-build が直接実行され、
fingerprint 判定に基づいてフルビルドまたは OTA update が走る。

**実行対象の ref には必ず回収したいリリースのタグを選ぶこと**（main の tip を選ぶと、
タグ以降にマージされた未リリースのコードがビルドされてしまう）:

```bash
gh workflow run Release --ref v<version> -f force_eas_build=true
```

workflow_dispatch は指定した ref のワークフロー定義を読むため、`force_eas_build`
入力が存在しない古いタグではこのコマンドは実行できない（422 になる）。
その場合はパターン A の Re-run を優先し、それも不可なら main を ref にして
実行する（タグ以降にマージされたコードが含まれる点を理解した上で）。

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| `EAS CLI couldn't find any credentials suitable for internal distribution` | 新ターゲットの Provisioning Profile 未登録 | 上記「ネイティブターゲットを追加したとき」を実施 |
| `Check runtime version for existing build` ステップで失敗 | `EXPO_TOKEN` 失効 or EAS API 障害 | token を更新して Re-run failed jobs |
| OTA update を配ったのにアプリに反映されない | 該当 fingerprint のビルドが存在しない | `force_eas_build` でフルビルドを作成 |
