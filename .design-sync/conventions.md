## Good Morning — 実装ガイド

React Native(react-native-web 経由でブラウザ描画)のダークテーマ UI キット。すべてのコンポーネントは `<View>`/`<Text>` 等の React Native プリミティブで構成されており、HTML タグではなくこのパッケージのコンポーネント + React Native プリミティブで組む。

### セットアップ

特別な Provider は不要。i18n(日本語固定)はパッケージ読み込み時に自動初期化される。唯一の前提: **すべてのコンポーネントはダーク背景(`colors.background` = `#1a1a2e`)の親の上に置かれる想定**で、自身では背景を塗らないものが多い。ルート要素は必ず背景色付きの `View` で囲む:

```tsx
import { View } from 'react-native';
import { ProgressBar, colors } from 'good-morning';

<View style={{ backgroundColor: colors.background, padding: 16 }}>
  <ProgressBar ratio={0.6} height={8} />
</View>
```

### スタイリングの慣用句 — CSS クラスなし、トークン参照の `StyleSheet.create()`

Tailwind 等のユーティリティクラスは存在しない。すべて `react-native` の `StyleSheet.create()` に、このパッケージが公開するトークン定数を渡す。

| トークン | 内容 |
|---|---|
| `colors` | `background #1a1a2e` `surface #16213e` `surfaceLight #0f3460` `primary #e94560`(アクセント/ピンク) `primaryLight #ff6b81` `text #ffffff` `textSecondary #a0a0b0` `textMuted #6b6b80` `success #2ed573` `warning #ffa502` `border #2a2a4e` `disabled #4a4a6a` |
| `spacing` | `xs 4` `sm 8` `md 16` `lg 24` `xl 32` `xxl 48` |
| `fontSize` | `xs 12` `sm 14` `md 16` `lg 20` `xl 24` `xxl 32` `time 56`(時刻表示専用の大型サイズ) |
| `borderRadius` | `sm 8` `md 12` `lg 16` `full 9999` |
| `commonStyles` | `card`(surface背景+borderRadius.md+padding.md)`section`(marginBottom.lg)`sectionTitle` — よくあるカード/セクション見出しの既製スタイル |
| `GRADE_COLORS` / `GRADE_UNDETERMINED_COLOR` | 起床グレード(`excellent`/`good`/`fair`/`poor`/未確定)ごとの表示色 |
| `RESULT_COLORS` | アラーム結果(`great`/`ok`/`late`/`missed`)ごとの表示色 |

新しい色・サイズを増やす場合もこのトークン集合に寄せる(ハードコードした hex/px 値は使わない)。

### コンポーネント構成

`ConfirmStep` / `DemoStep` / `PermissionStep` / `StepHeader` / `StepButton` / `TimeStep` / `TodosStep` / `WelcomeStep` はオンボーディングのステップ画面(`StepButton` の `variant="primary"|"secondary"` + `flex` prop で画面下部のボタン行を組む)。`DailyGradeSection` / `GradeIcon` / `StreakBadge` は起床グレード表示系(`GradeIcon` は `grade` に `excellent|good|fair|poor|null` を渡す一文字シンボル)。`SleepCard` / `SleepDetailSection` / `SleepDurationCard` / `SleepDurationPickerModal` / `SleepTimelineBar` は睡眠データ表示・目標時間設定系。`DayBoundaryPicker` / `MorningRoutineBanner` / `SquatChallengeItem` / `TodoListItem` / `ProgressBar` はダッシュボード/タスク系の汎用部品。

### 参照すべき実体

トークンの正確な値・型は `tokens/` 配下ではなくこのパッケージのバンドル自体(`colors`/`spacing`/`fontSize`/`borderRadius`/`commonStyles` を直接 import 可能)に含まれる。各コンポーネントの詳細な props・用途は同梱の `<Name>.prompt.md` を参照。

### ビルド例(ProgressBar — 検証済みプレビューから)

```tsx
import { View } from 'react-native';
import { ProgressBar, colors } from 'good-morning';

function Example() {
  return (
    <View style={{ backgroundColor: colors.background, padding: 16, gap: 12 }}>
      <ProgressBar ratio={0.9} height={8} />
      <ProgressBar ratio={0.6} height={12} trackColor={colors.surfaceLight} fillColor={colors.primary} />
    </View>
  );
}
```
