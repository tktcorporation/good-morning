---
'good-morning': patch
---

iOS 起動時の `useFrameSize must be used within a FrameSizeProvider` クラッシュを修正。`@react-navigation/bottom-tabs` を expo-router が引き込むバージョン (7.15.5) に揃えることで、`@react-navigation/elements` の重複インストール（2.9.8 と 2.9.10 が共存）を解消し、`FrameSizeProvider` と `useFrameSize` が同じ React Context を参照するようにした。

合わせて、Provider 系ライブラリの重複を CI で検知するテスト (`src/__tests__/no-duplicate-providers.test.ts`) を追加。
