# UI State Catalog 自動生成システム設計

## 概要

全画面の UI 状態を Storybook で管理し、スクリーンショットの自動撮影と
markdown カタログの自動生成を行うシステムを構築する。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────┐
│  Screen State Registry (src/docs/screen-states.ts)  │  ← 単一の真実源
│  画面名・状態名・条件・モックデータ・UXメモ          │
└──────────┬────────────────────────┬──────────────────┘
           │                        │
           ▼                        ▼
┌──────────────────────┐  ┌──────────────────────────┐
│ Storybook Stories    │  │ Doc Generator Script     │
│ (.stories.tsx)       │  │ (scripts/generate-ui-    │
│                      │  │  docs.ts)                │
│ Registry の各状態を  │  │                          │
│ Story として登録     │  │ Registry + screenshots/  │
└──────────┬───────────┘  │ → docs/ui-states.md     │
           │               └──────────────────────────┘
           ▼                        ▲
┌──────────────────────┐            │
│ Screenshot Runner    │            │
│ (Playwright)         ├────────────┘
│                      │  screenshots を
│ Storybook Web →      │  docs/screenshots/ に保存
│ 各 Story を撮影      │
└──────────────────────┘
```

## 技術選定

### Storybook Web（`@storybook/react` + `react-native-web`）

**理由**:
- ヘッドレスブラウザで動作 → CI/CD でスクリーンショット自動撮影が可能
- 実機/シミュレータ不要 → DevContainer でも動作
- `react-native-web` は Expo がすでに内部で使用している

**トレードオフ**:
- iOS ネイティブと完全に同じ見た目にはならない（SafeAreaView 等）
- ネイティブモジュール（AlarmKit, HealthKit）は全てモック必須

### なぜ `@storybook/react-native` ではないか

- デバイス/シミュレータ上で動作するため、スクリーンショット撮影の自動化が困難
- CI でのヘッドレス実行ができない
- 目的は「UI状態の記録」であり、ピクセルパーフェクトな再現ではない

## ファイル構成

```
.storybook/
  main.ts              # Storybook 設定（webpack alias, mock）
  preview.ts           # グローバルデコレーター（テーマ, i18n）

src/
  docs/
    screen-states.ts   # Screen State Registry（全状態の定義）
    types.ts           # Registry の型定義

  stories/
    Dashboard.stories.tsx     # ダッシュボード画面の Stories
    Settings.stories.tsx      # 設定画面の Stories
    Onboarding.stories.tsx    # オンボーディングの Stories
    TargetEdit.stories.tsx    # 時刻変更の Stories
    Schedule.stories.tsx      # スケジュールの Stories
    DayReview.stories.tsx     # 日次レビューの Stories

scripts/
  capture-screenshots.ts     # Playwright でスクリーンショット撮影
  generate-ui-docs.ts        # Registry + screenshots → markdown 生成

docs/
  ui-states.md               # ← 自動生成される
  screenshots/               # ← 自動生成される
```

## Screen State Registry の設計

```typescript
// src/docs/types.ts
export interface ScreenState {
  /** 画面表示用の名前 */
  name: string;
  /** 条件の説明 */
  condition: string;
  /** スクリーンショットファイル名（自動生成） */
  screenshotFile: string;
  /** UX 改善メモ（任意） */
  uxNotes?: string;
  /** モックデータを準備する関数（Story で使用） */
  // setupMocks は Story 側で定義
}

export interface ScreenDefinition {
  /** 画面名 */
  name: string;
  /** ルートパス */
  route: string;
  /** ナビゲーション種別 */
  type: 'tab' | 'modal' | 'stack' | 'layout';
  /** ソースファイルパス */
  sourceFile: string;
  /** この画面が取りうる全状態 */
  states: ScreenState[];
  /** 画面の説明 */
  description: string;
}
```

## 実装順序

### Phase 1: Registry + Doc Generator（Storybook なしで動作確認）
1. `src/docs/types.ts` — 型定義
2. `src/docs/screen-states.ts` — 既存 `ui-states.md` の情報を構造化データに移行
3. `scripts/generate-ui-docs.ts` — Registry から markdown を生成
4. `package.json` に `pnpm generate:ui-docs` スクリプト追加
5. **確認**: 生成された `docs/ui-states.md` が手書き版と同等

### Phase 2: Storybook セットアップ
1. `react-native-web`, `@storybook/react`, `storybook` をインストール
2. `.storybook/main.ts` — webpack alias + native module mock 設定
3. `.storybook/preview.ts` — テーマ・i18n デコレーター
4. テスト用に1画面分の Story を作成（Dashboard Idle）
5. **確認**: `pnpm storybook` でブラウザ表示

### Phase 3: 全画面の Stories 作成
1. 各画面の Stories を Registry の状態定義に基づいて作成
2. モックデータの準備（Zustand store のモック、ネイティブモジュールのスタブ）
3. **確認**: 全状態が Storybook で表示

### Phase 4: スクリーンショット自動撮影
1. Playwright インストール・設定
2. `scripts/capture-screenshots.ts` — Storybook を起動し各 Story を撮影
3. `package.json` に `pnpm capture:screenshots` スクリプト追加
4. **確認**: `docs/screenshots/` にスクリーンショットが生成される

### Phase 5: 統合
1. `pnpm generate:ui-docs` を capture + generate の統合コマンドに
2. CI での実行（GitHub Actions）を検討
3. 手書きの `docs/ui-states.md` を自動生成版に置き換え

## ネイティブモジュールのモック戦略

既存の `jest.setup.js` のモックパターンを Storybook 用に転用する:

```typescript
// .storybook/mocks/native-modules.ts
// jest.setup.js と同じモック構造を、Storybook の webpack resolve.alias で適用

export const alarmKitMock = {
  configure: () => {},
  requestAuthorization: async () => 'authorized',
  scheduleAlarm: async () => 'mock-alarm-id',
  // ... jest.setup.js と同じ
};
```

**Webpack alias**:
```typescript
// .storybook/main.ts
webpackFinal: (config) => {
  config.resolve.alias = {
    ...config.resolve.alias,
    'react-native$': 'react-native-web',
    'expo-alarm-kit': path.resolve(__dirname, 'mocks/expo-alarm-kit'),
    '@kingstinct/react-native-healthkit': path.resolve(__dirname, 'mocks/healthkit'),
    // ...
  };
};
```

## npm scripts

```json
{
  "storybook": "storybook dev -p 6006",
  "storybook:build": "storybook build",
  "capture:screenshots": "tsx scripts/capture-screenshots.ts",
  "generate:ui-docs": "tsx scripts/generate-ui-docs.ts",
  "docs:ui": "pnpm capture:screenshots && pnpm generate:ui-docs"
}
```

## 考慮事項

- **react-native-web の制約**: `Switch`, `Pressable` 等は動作するが、
  カスタムネイティブコンポーネントは全てモック必要
- **i18n**: Storybook デコレーターで `i18next` を初期化し、日本語/英語の切替を可能に
- **テーマ**: ダークテーマのみなので、Storybook の背景色を `colors.background` に設定
- **Zustand**: 各 Story で `useStore.setState()` を使ってモック状態を注入
