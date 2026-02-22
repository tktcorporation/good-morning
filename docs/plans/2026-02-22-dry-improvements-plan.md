# DRY Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** プロジェクト全体のDRY違反を解消し、設定値の一元管理とコードの重複排除を行う。

**Architecture:** 3つの独立したレイヤー（設定値、共有定数/ユーティリティ、共有コンポーネント）を段階的に改善する。各レイヤーは並列に作業可能。

**Tech Stack:** TypeScript, Expo SDK 54, React Native, Zustand, GitHub Actions, Biome

---

## Task 1: CI workflow — Node.jsバージョンを env で一元定義

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/eas-build.yml`

**Step 1: ci.yml に workflow レベル env を追加し、各ジョブの node-version を参照に変更**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

env:
  NODE_VERSION: '22'

jobs:
  setup:
    name: Setup
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile

  typecheck:
    name: Typecheck
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  lint:
    name: Lint
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  format:
    name: Format
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm biome format .

  test:
    name: Test
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
```

**Step 2: eas-build.yml も同様に env で一元定義**

`node-version: 22` (L43) を `${{ env.NODE_VERSION }}` に変更し、workflow レベルに `env: NODE_VERSION: '22'` を追加。

**Step 3: Commit**

```bash
jj commit -m "ci: centralize Node.js version in workflow env"
```

---

## Task 2: app.json → app.config.ts 変換（バージョン一元管理）

**Files:**
- Delete: `app.json`
- Create: `app.config.ts`

**Step 1: app.config.ts を作成し、package.json から version を読み込む**

```typescript
import type { ExpoConfig, ConfigContext } from 'expo/config';

// biome-ignore lint/style/noDefaultExport: Expo config requires default export
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Good Morning',
  slug: 'good-morning',
  version: require('./package.json').version,
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'good-morning',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#1a1a2e',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.tktcorporation.goodmorning',
    infoPlist: {
      UIBackgroundModes: ['audio'],
      ITSAppUsesNonExemptEncryption: false,
    },
    entitlements: {
      'com.apple.developer.healthkit': true,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#1a1a2e',
    },
    package: 'com.goodmorning.app',
    edgeToEdgeEnabled: true,
    permissions: ['android.permission.RECORD_AUDIO', 'android.permission.MODIFY_AUDIO_SETTINGS'],
  },
  plugins: [
    'expo-router',
    'expo-av',
    [
      'react-native-health',
      {
        healthSharePermission:
          'Good Morning はあなたの睡眠データを読み取り、起床パターンを分析します',
      },
    ],
  ],
  extra: {
    router: {},
    eas: {
      projectId: 'a7deb1ff-f5c1-4073-b33a-1505a7073130',
    },
  },
  owner: 'tktcorporation',
});
```

**Step 2: app.json を削除**

**Step 3: settings.tsx のバージョンハードコードを修正**

`app/(tabs)/settings.tsx:77` の `{ version: '1.0.0' }` を `{ version: require('expo-constants').default.expoConfig?.version ?? '0.0.0' }` に変更。
ただし import が必要なので、ファイル先頭に `import Constants from 'expo-constants';` を追加し、`Constants.expoConfig?.version ?? '0.0.0'` を使う。

**Step 4: typecheck で確認**

Run: `pnpm typecheck`

**Step 5: Commit**

```bash
jj commit -m "refactor: convert app.json to app.config.ts for version DRY"
```

---

## Task 3: RESULT_COLORS を theme.ts に統合

**Files:**
- Modify: `src/constants/theme.ts`
- Modify: `src/components/stats/WeeklyCalendar.tsx` (L16-21 削除、import追加)
- Modify: `app/(tabs)/index.tsx` (L13-18 削除、import追加)
- Modify: `app/day-review.tsx` (L10-15 削除、import追加)

**Step 1: theme.ts に RESULT_COLORS と semanticColors を追加**

`src/constants/theme.ts` に追加:

```typescript
import type { WakeResult } from '../types/wake-record';

export const RESULT_COLORS: Readonly<Record<WakeResult, string>> = {
  great: colors.success,
  ok: colors.success,
  late: colors.warning,
  missed: colors.primary,
};

export const semanticColors = {
  successLight: 'rgba(46, 213, 115, 0.15)',
  warningLight: 'rgba(255, 165, 2, 0.15)',
} as const;
```

**Step 2: WeeklyCalendar.tsx のローカル RESULT_COLORS を削除し import に変更**

L16-21 を削除。L4 の import に `RESULT_COLORS` を追加:
```typescript
import { borderRadius, colors, fontSize, RESULT_COLORS, spacing } from '../../constants/theme';
```

**Step 3: index.tsx のローカル RESULT_COLORS を削除し import に変更**

L13-18 を削除。L5 の import に `RESULT_COLORS` を追加:
```typescript
import { borderRadius, colors, fontSize, RESULT_COLORS, spacing } from '../../src/constants/theme';
```

**Step 4: day-review.tsx のローカル RESULT_COLORS を削除し import に変更**

L10-15 を削除。L5 の import に `RESULT_COLORS` を追加:
```typescript
import { borderRadius, colors, fontSize, RESULT_COLORS, spacing } from '../src/constants/theme';
```

**Step 5: settings.tsx のハードコード rgba 値を semanticColors に変更**

L132: `backgroundColor: 'rgba(46, 213, 115, 0.15)'` → `backgroundColor: semanticColors.successLight`
L136: `backgroundColor: 'rgba(255, 165, 2, 0.15)'` → `backgroundColor: semanticColors.warningLight`

import に `semanticColors` を追加。

**Step 6: typecheck で確認**

Run: `pnpm typecheck`

**Step 7: Commit**

```bash
jj commit -m "refactor: centralize RESULT_COLORS and semanticColors in theme"
```

---

## Task 4: 日付ユーティリティを src/utils/date.ts に集約

**Files:**
- Create: `src/utils/date.ts`
- Modify: `src/components/stats/WeeklyCalendar.tsx` (formatIsoTime 削除)
- Modify: `app/(tabs)/index.tsx` (getWeekDates, getDayLabel, getRecordForDate, DAY_NAMES 削除)
- Modify: `src/types/wake-record.ts` (formatDateString はそのまま残す、re-export でも可)

**Step 1: src/utils/date.ts を作成**

```typescript
/**
 * ISO datetime 文字列から HH:MM 形式にフォーマットする。
 */
export function formatIsoTime(isoString: string): string {
  const date = new Date(isoString);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * 今週の月曜日〜日曜日の Date 配列を返す。
 */
export function getWeekDates(baseDate: Date = new Date()): readonly Date[] {
  const dayOfWeek = baseDate.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() + mondayOffset);

  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}
```

**Step 2: WeeklyCalendar.tsx の formatIsoTime を import に置き換え**

L38-43 の `formatIsoTime` 関数を削除。import 追加:
```typescript
import { formatIsoTime } from '../../utils/date';
```

**Step 3: index.tsx のローカル関数を置き換え**

- L20 `DAY_NAMES` 削除
- L28-31 `getDayLabel` 削除
- L33-48 `getWeekDates` 削除
- L50-53 `getRecordForDate` 削除

import 追加:
```typescript
import { getWeekDates } from '../../src/utils/date';
```

`getDayLabel` は既存の `src/types/alarm.ts` の関数を使う。
`getRecordForDate` はストアの `getRecordsForPeriod` に置き換え（Task 5 で対応）。

`tomorrowLabel` の `getDayLabel(tomorrow)` は i18n 対応にする:
```typescript
import { getDayLabel } from '../../src/types/alarm';
import type { DayOfWeek } from '../../src/types/alarm';
// ...
const tomorrowLabel = useMemo(() => {
  const dayLabel = getDayLabel(tomorrow.getDay() as DayOfWeek, tCommon as (key: string) => string);
  return `${tCommon('tomorrow')}, ${dayLabel}`;
}, [tomorrow, tCommon]);
```

`DAY_NAMES[date.getDay()]` (L197) も `getDayLabel` に置き換え。

**Step 4: typecheck で確認**

Run: `pnpm typecheck`

**Step 5: Commit**

```bash
jj commit -m "refactor: extract shared date utilities to src/utils/date.ts"
```

---

## Task 5: index.tsx の weekRecords を getRecordsForPeriod に置き換え

**Files:**
- Modify: `app/(tabs)/index.tsx` (L86-93)

**Step 1: ストアの getRecordsForPeriod を使う**

L86-93 を以下に置き換え:

```typescript
const getRecordsForPeriod = useWakeRecordStore((s) => s.getRecordsForPeriod);

const weekRecords = useMemo(() => {
  if (weekStart === undefined) return [];
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  return getRecordsForPeriod(weekStart, weekEnd);
}, [getRecordsForPeriod, weekStart]);
```

`records` selector (L65) は `weekRecords` でのみ使われていたので削除可能か確認。
→ `getRecordForDate` でも使われていたが Task 4 で削除済みなので、`records` の直接参照は不要になる。

**Step 2: typecheck で確認**

Run: `pnpm typecheck`

**Step 3: Commit**

```bash
jj commit -m "refactor: use store's getRecordsForPeriod instead of inline filter"
```

---

## Task 6: CLAUDE.md の設定値参照化

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Conventions セクションを簡潔に**

現在:
```markdown
## Conventions
- Strict TypeScript: noUnusedLocals, noUnusedParameters, noImplicitReturns, noUncheckedIndexedAccess
- Biome ルール: no explicit any, no non-null assertions, use const, organize imports
- シングルクォート、セミコロンあり、2スペースインデント、100文字行幅
```

変更後:
```markdown
## Conventions
- pnpm を使用 (npm, yarn は使わない)
- Biome でリント・フォーマット (ESLint/Prettier は使わない) — 設定は biome.json を参照
- パスエイリアス: `@/*` は `./src/*` にマッピング
- Strict TypeScript — 設定は tsconfig.json を参照
```

**Step 2: Commit**

```bash
jj commit -m "docs: simplify CLAUDE.md by referencing config files"
```

---

## Task 7: onboarding 共有コンポーネント — StepButton

**Files:**
- Create: `src/components/onboarding/StepButton.tsx`
- Modify: `src/components/onboarding/WelcomeStep.tsx`
- Modify: `src/components/onboarding/PermissionStep.tsx`
- Modify: `src/components/onboarding/TimeStep.tsx`
- Modify: `src/components/onboarding/TodosStep.tsx`
- Modify: `src/components/onboarding/DemoStep.tsx`

**Step 1: StepButton コンポーネントを作成**

```typescript
// src/components/onboarding/StepButton.tsx
import { Pressable, type PressableProps, StyleSheet, Text } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../../constants/theme';

interface StepButtonProps extends Pick<PressableProps, 'disabled'> {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant: 'primary' | 'secondary';
  readonly flex?: number;
}

export function StepButton({ label, onPress, variant, flex, disabled }: StepButtonProps) {
  return (
    <Pressable
      style={[
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        flex !== undefined && { flex },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      disabled={disabled}
    >
      <Text style={[styles.text, variant === 'secondary' && styles.textSecondary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  textSecondary: {
    color: colors.textSecondary,
  },
});
```

**Step 2: 各 onboarding ファイルのボタンを StepButton に置き換え**

各ファイルで `backButton`, `nextButton`, `backButtonText`, `nextButtonText` 等のスタイル定義を削除し、`<StepButton>` に置き換え。

例: TimeStep.tsx
```tsx
// Before:
<Pressable style={styles.backButton} onPress={onBack} accessibilityRole="button">
  <Text style={styles.backButtonText}>{t('back')}</Text>
</Pressable>
<Pressable style={styles.nextButton} onPress={onNext} accessibilityRole="button">
  <Text style={styles.nextButtonText}>{t('next')}</Text>
</Pressable>

// After:
<StepButton label={t('back')} onPress={onBack} variant="secondary" flex={1} />
<StepButton label={t('next')} onPress={onNext} variant="primary" flex={1} />
```

**Step 3: typecheck で確認**

Run: `pnpm typecheck`

**Step 4: Commit**

```bash
jj commit -m "refactor: extract StepButton shared onboarding component"
```

---

## Task 8: onboarding 共有コンポーネント — StepHeader

**Files:**
- Create: `src/components/onboarding/StepHeader.tsx`
- Modify: `src/components/onboarding/PermissionStep.tsx`
- Modify: `src/components/onboarding/TimeStep.tsx`
- Modify: `src/components/onboarding/TodosStep.tsx`
- Modify: `src/components/onboarding/DemoStep.tsx`

**Note:** WelcomeStep は独自のスタイル (fontSize.time) を使っているので対象外。

**Step 1: StepHeader コンポーネントを作成**

```typescript
// src/components/onboarding/StepHeader.tsx
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../../constants/theme';

interface StepHeaderProps {
  readonly title: string;
  readonly subtitle: string;
}

export function StepHeader({ title, subtitle }: StepHeaderProps) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
});
```

**Step 2: 各 onboarding ファイルのヘッダーを StepHeader に置き換え**

例: TimeStep.tsx
```tsx
// Before:
<View style={styles.header}>
  <Text style={styles.title}>{t('time.title')}</Text>
  <Text style={styles.subtitle}>{t('time.subtitle')}</Text>
</View>

// After:
<StepHeader title={t('time.title')} subtitle={t('time.subtitle')} />
```

各ファイルの `header`, `title`, `subtitle` スタイルを削除。

**Step 3: typecheck で確認**

Run: `pnpm typecheck`

**Step 4: Commit**

```bash
jj commit -m "refactor: extract StepHeader shared onboarding component"
```

---

## Task 9: theme.ts に commonStyles を追加

**Files:**
- Modify: `src/constants/theme.ts`
- Modify: `app/(tabs)/index.tsx` (section, sectionTitle を commonStyles に)
- Modify: `app/(tabs)/settings.tsx` (section, sectionTitle を commonStyles に)
- Modify: `app/day-review.tsx` (sectionTitle を commonStyles に)

**Step 1: theme.ts に commonStyles を追加**

```typescript
import { StyleSheet } from 'react-native';

export const commonStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
});
```

**Step 2: 各ファイルのローカル section/sectionTitle スタイルを commonStyles 参照に置き換え**

index.tsx, settings.tsx, day-review.tsx で `styles.section` → `commonStyles.section`、`styles.sectionTitle` → `commonStyles.sectionTitle` に変更し、ローカルの定義を削除。

**Step 3: typecheck で確認**

Run: `pnpm typecheck`

**Step 4: Commit**

```bash
jj commit -m "refactor: add commonStyles to theme for shared section patterns"
```

---

## Task 10: 最終検証

**Step 1: 全テスト実行**

Run: `pnpm test`

**Step 2: typecheck**

Run: `pnpm typecheck`

**Step 3: lint**

Run: `pnpm lint`

**Step 4: format**

Run: `pnpm format`

**Step 5: 問題があれば修正してコミット**

---

## 並列実行可能なタスクグループ

以下のタスクは互いに独立しており並列実行が可能:

**Group A (設定):** Task 1, Task 2, Task 6
**Group B (定数/ユーティリティ):** Task 3, Task 4 → Task 5 (Task 4 に依存)
**Group C (コンポーネント):** Task 7, Task 8, Task 9

Task 10 は全タスク完了後に実行。
