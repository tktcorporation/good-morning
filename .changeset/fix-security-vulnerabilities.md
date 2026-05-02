---
"good-morning": patch
---

セキュリティ脆弱性のある依存関係を修正:

- `babel-preset-expo` を 55.0.9 → 55.0.19 に更新
- `@changesets/cli` を 2.30.0 → 2.31.0 に更新
- `knip` を 5.88.1 → 6.11.0 に更新
- 推移的依存関係の lockfile 内バージョンを範囲内で更新:
  - `minimatch` 3.1.2 → 3.1.5 (ReDoS 修正)
  - `node-forge` 1.3.3 → 1.4.0 (署名偽造・DoS 修正)
  - `@xmldom/xmldom` 0.8.11 → 0.8.13 (XML injection 修正)
  - `lodash` 4.17.23 → 4.18.1 (Code Injection / Prototype Pollution 修正)
  - `picomatch` 2.3.1 → 2.3.2, 4.0.3 → 4.0.4 (ReDoS / POSIX クラス修正)
  - `brace-expansion` 1.1.12 → 1.1.13, 5.0.2 → 5.0.5 (DoS 修正)
  - `yaml` 2.8.2 → 2.8.4 (Stack Overflow 修正)
  - `smol-toml` 1.6.0 → 1.6.1 (DoS 修正)

残存する脆弱性 3 件は親パッケージのバージョン範囲指定により範囲内アップグレード不可能 (`@tootallnate/once`, `uuid@7.x` from `xcode`, `postcss@8.4.x` from `@expo/metro-config`)。これらは override や親パッケージ自体のメジャー更新なしには修正できない。

加えて以下の通常依存も最新パッチ/マイナーへ更新:

- `@biomejs/biome` 2.4.4 → 2.4.14 (biome.json schema URL も追従)
- `effect` 3.20.0 → 3.21.2
- `zustand` 5.0.11 → 5.0.12

`@react-navigation/bottom-tabs` は Expo SDK 55 が要求する `@react-navigation/native@^7.1.33` との互換性維持のため 7.15.5 のまま据え置き (7.15.6+ は `^7.1.34` 以降を要求)。
