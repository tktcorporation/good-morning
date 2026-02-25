# HealthKit 睡眠データ統合表示 実装プラン

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** HealthKit の睡眠データをアラーム解除ログと統合し、react-native-svg によるタイムラインバーでダッシュボードと日別レビュー画面に表示する。

**Architecture:** HealthKit データはオンデマンドで取得（永続化しない）。`useDailySummary` hookで HealthKit の `SleepSummary` と既存の `WakeRecord` を統合。`SleepTimelineBar` コンポーネント（react-native-svg）でグラフィカルに描画し、`SleepCard`（ダッシュボード）と `SleepDetailSection`（日別レビュー）から利用する。

**Tech Stack:** React Native, react-native-svg, Zustand, TypeScript, Jest

**Design doc:** `docs/plans/2026-02-24-sleep-integration-design.md`

---

## Task 1: react-native-svg のインストール

**Files:**
- Modify: `package.json`

**Step 1: パッケージインストール**

Run: `pnpm add react-native-svg`

**Step 2: jest.config.js に transformIgnorePatterns 追加**

Modify `jest.config.js` の `transformIgnorePatterns`:

```js
transformIgnorePatterns: [
  'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*|zustand|react-native-svg)',
],
```

**Step 3: jest.setup.js に react-native-svg のモック追加**

Append to `jest.setup.js`:

```js
// Mock react-native-svg
jest.mock('react-native-svg', () => {
  const React = require('react');
  const MockSvg = (props) => React.createElement('Svg', props);
  MockSvg.displayName = 'Svg';
  const createMockComponent = (name) => {
    const Component = (props) => React.createElement(name, props);
    Component.displayName = name;
    return Component;
  };
  return {
    __esModule: true,
    default: MockSvg,
    Svg: MockSvg,
    Rect: createMockComponent('Rect'),
    Line: createMockComponent('Line'),
    Text: createMockComponent('SvgText'),
    G: createMockComponent('G'),
    Defs: createMockComponent('Defs'),
    ClipPath: createMockComponent('ClipPath'),
  };
});
```

**Step 4: 動作確認**

Run: `pnpm test`
Expected: 既存テストが全て PASS

**Step 5: コミット**

```bash
jj commit -m "chore: add react-native-svg dependency"
```

---

## Task 2: i18n キーの追加

**Files:**
- Modify: `src/i18n/locales/ja/stats.json`
- Modify: `src/i18n/locales/en/stats.json`

**Step 1: 日本語キー追加**

`src/i18n/locales/ja/stats.json` の `healthKit` セクションに追加:

```json
{
  "healthKit": {
    "connect": "ヘルスケアと連携",
    "connected": "ヘルスケア連携済み",
    "noData": "睡眠データが見つかりません",
    "noDataHint": "ヘルスケアアプリで権限を確認してください",
    "wakeTime": "HealthKit起床時刻",
    "sleep": {
      "title": "睡眠データ",
      "lastNight": "昨晩の睡眠",
      "bedtime": "就寝時刻",
      "wakeTime": "起床時刻",
      "duration": "睡眠時間",
      "noData": "データなし",
      "connect": "ヘルスケアと連携する",
      "targetTime": "目標時刻",
      "dismissedAt": "解除時刻",
      "hours": "{{h}}時間{{m}}分"
    }
  }
}
```

**Step 2: 英語キー追加**

`src/i18n/locales/en/stats.json` の `healthKit` セクションに追加:

```json
{
  "healthKit": {
    "connect": "Connect to Health",
    "connected": "Health Connected",
    "noData": "No sleep data found",
    "noDataHint": "Check permissions in the Health app",
    "wakeTime": "HealthKit Wake Time",
    "sleep": {
      "title": "Sleep Data",
      "lastNight": "Last Night's Sleep",
      "bedtime": "Bedtime",
      "wakeTime": "Wake Time",
      "duration": "Duration",
      "noData": "No Data",
      "connect": "Connect to Health",
      "targetTime": "Target Time",
      "dismissedAt": "Dismissed At",
      "hours": "{{h}}h {{m}}m"
    }
  }
}
```

**Step 3: コミット**

```bash
jj commit -m "i18n: add sleep integration translation keys"
```

---

## Task 3: settings-store に healthKitEnabled を追加

**Files:**
- Modify: `src/stores/settings-store.ts`
- Modify: `src/__tests__/settings-store.test.ts`

**Step 1: テスト追加**

`src/__tests__/settings-store.test.ts` に追加:

```ts
test('healthKitEnabled defaults to false', async () => {
  mockGetItem.mockResolvedValue(null);
  await useSettingsStore.getState().loadSettings();
  expect(useSettingsStore.getState().healthKitEnabled).toBe(false);
});

test('setHealthKitEnabled persists to AsyncStorage', async () => {
  await useSettingsStore.getState().loadSettings();
  await useSettingsStore.getState().setHealthKitEnabled(true);
  expect(useSettingsStore.getState().healthKitEnabled).toBe(true);
  expect(mockSetItem).toHaveBeenCalledWith(
    'app-settings',
    expect.stringContaining('"healthKitEnabled":true'),
  );
});

test('loadSettings restores healthKitEnabled', async () => {
  mockGetItem.mockResolvedValue(
    JSON.stringify({ dayBoundaryHour: 3, healthKitEnabled: true }),
  );
  await useSettingsStore.getState().loadSettings();
  expect(useSettingsStore.getState().healthKitEnabled).toBe(true);
});
```

**Step 2: テストが失敗することを確認**

Run: `pnpm test -- src/__tests__/settings-store.test.ts`
Expected: FAIL (healthKitEnabled プロパティが存在しない)

**Step 3: settings-store を実装**

`src/stores/settings-store.ts` を修正:

```ts
interface AppSettings {
  readonly dayBoundaryHour: number;
  readonly healthKitEnabled: boolean;
}

interface SettingsState {
  readonly dayBoundaryHour: number;
  readonly healthKitEnabled: boolean;
  readonly loaded: boolean;
  loadSettings: () => Promise<void>;
  setDayBoundaryHour: (hour: number) => Promise<void>;
  setHealthKitEnabled: (enabled: boolean) => Promise<void>;
}
```

`loadSettings` で `healthKitEnabled` を復元（デフォルト `false`）。
`setHealthKitEnabled` で `persist` を呼ぶ。
`persist` で両フィールドを保存するように修正。

**Step 4: テスト通過確認**

Run: `pnpm test -- src/__tests__/settings-store.test.ts`
Expected: ALL PASS

**Step 5: コミット**

```bash
jj commit -m "feat: add healthKitEnabled to settings store"
```

---

## Task 4: useDailySummary hook

**Files:**
- Create: `src/hooks/useDailySummary.ts`
- Create: `src/__tests__/useDailySummary.test.ts`

**Step 1: テスト作成**

`src/__tests__/useDailySummary.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react-native';
// NOTE: @testing-library/react-native が無い場合は手動テストに切り替え。
// その場合はこのテストファイルをスキップし、Step 3 に進む。
```

HealthKit サービスのモックが複雑なため、このhookは**ユニットテストより統合テストで検証**する。
代わりに、hook のロジック部分（純粋関数）を分離してテスト可能にする。

`src/hooks/useDailySummary.ts` を作成:

```ts
import { useEffect, useState } from 'react';
import { getSleepSummary, isHealthKitInitialized } from '../services/health';
import type { SleepSummary } from '../services/health';
import { useSettingsStore } from '../stores/settings-store';
import { useWakeRecordStore } from '../stores/wake-record-store';
import type { WakeRecord } from '../types/wake-record';
import { formatDateString } from '../types/wake-record';

export interface DailySummary {
  readonly date: string;
  readonly sleep: SleepSummary | null;
  readonly record: WakeRecord | undefined;
  readonly loading: boolean;
}

export function useDailySummary(date: Date): DailySummary {
  const [sleep, setSleep] = useState<SleepSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const dateStr = formatDateString(date);
  const records = useWakeRecordStore((s) => s.records);
  const healthKitEnabled = useSettingsStore((s) => s.healthKitEnabled);

  const record = records.find((r) => r.date === dateStr);

  useEffect(() => {
    if (!healthKitEnabled || !isHealthKitInitialized()) {
      setLoading(false);
      setSleep(null);
      return;
    }

    setLoading(true);
    getSleepSummary(date)
      .then((summary) => setSleep(summary))
      .catch(() => setSleep(null))
      .finally(() => setLoading(false));
  }, [date, healthKitEnabled]);

  return { date: dateStr, sleep, record, loading };
}
```

**Step 2: 型チェック**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: コミット**

```bash
jj commit -m "feat: add useDailySummary hook for HealthKit + WakeRecord integration"
```

---

## Task 5: SleepTimelineBar コンポーネント

**Files:**
- Create: `src/components/sleep/SleepTimelineBar.tsx`

**Step 1: タイムライン計算ユーティリティ（同ファイル内）**

時刻を横軸位置（0〜1）に変換する純粋関数:

```ts
const TIMELINE_START_HOUR = 20; // 20:00
const TIMELINE_HOURS = 16;     // 20:00 → 翌12:00

function timeToPosition(date: Date): number {
  let hours = date.getHours() + date.getMinutes() / 60;
  // 20:00以前の時刻は翌日扱い（+24）
  if (hours < TIMELINE_START_HOUR) {
    hours += 24;
  }
  return (hours - TIMELINE_START_HOUR) / TIMELINE_HOURS;
}

function alarmTimeToPosition(hour: number, minute: number): number {
  let hours = hour + minute / 60;
  if (hours < TIMELINE_START_HOUR) {
    hours += 24;
  }
  return (hours - TIMELINE_START_HOUR) / TIMELINE_HOURS;
}
```

**Step 2: SVG コンポーネント実装**

```tsx
import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, Line, Rect, Text as SvgText } from 'react-native-svg';
import type { AlarmTime } from '../../types/alarm';
import { colors, fontSize as themeFontSize } from '../../constants/theme';

interface SleepTimelineBarProps {
  readonly bedtime: Date | null;
  readonly wakeTime: Date | null;
  readonly targetTime: AlarmTime | null;
  readonly dismissedAt: Date | null;
  readonly compact?: boolean;
}
```

描画内容:
- 背景: 全幅の暗い Rect
- 睡眠範囲: bedtime〜wakeTime の範囲を `colors.primary` (opacity 0.4) の丸角 Rect
- 目標時刻マーカー: 点線 Line (colors.warning)
- 解除時刻マーカー: 実線 Line (colors.success)
- 時刻ラベル: 下部に 20, 22, 0, 2, 4, 6, 8, 10, 12 のラベル（compact でなければ）
- compact: 高さ 60px、ラベルなし
- 通常: 高さ 100px、ラベルあり

**Step 3: 型チェック**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: コミット**

```bash
jj commit -m "feat: add SleepTimelineBar SVG component"
```

---

## Task 6: SleepCard コンポーネント（ダッシュボード用）

**Files:**
- Create: `src/components/sleep/SleepCard.tsx`

**Step 1: 実装**

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { borderRadius, colors, commonStyles, fontSize, spacing } from '../../constants/theme';
import { initHealthKit } from '../../services/health';
import { useSettingsStore } from '../../stores/settings-store';
import type { DailySummary } from '../../hooks/useDailySummary';
import { SleepTimelineBar } from './SleepTimelineBar';

interface SleepCardProps {
  readonly summary: DailySummary;
}
```

表示ロジック:
- `summary.loading` → ローディングインジケーター
- `!healthKitEnabled` → 「ヘルスケアと連携する」ボタン（onPress で `initHealthKit()` → `setHealthKitEnabled(true)`）
- `summary.sleep === null` → 「データなし」テキスト
- `summary.sleep !== null` → SleepTimelineBar (compact) + 就寝/起床/睡眠時間のサマリー行

睡眠時間フォーマット: `totalMinutes` を `Xh Ym` に変換するヘルパー。

**Step 2: 型チェック**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: コミット**

```bash
jj commit -m "feat: add SleepCard component for dashboard"
```

---

## Task 7: SleepDetailSection コンポーネント（日別レビュー用）

**Files:**
- Create: `src/components/sleep/SleepDetailSection.tsx`

**Step 1: 実装**

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { borderRadius, colors, commonStyles, fontSize, spacing } from '../../constants/theme';
import type { DailySummary } from '../../hooks/useDailySummary';
import { formatIsoTime } from '../../utils/date';
import { SleepTimelineBar } from './SleepTimelineBar';

interface SleepDetailSectionProps {
  readonly summary: DailySummary;
}
```

表示内容:
- セクションタイトル: 「睡眠データ」
- SleepTimelineBar (通常サイズ、compact=false)
- 詳細行: 就寝時刻 / 起床時刻 / 睡眠時間
- データなし時: グレーテキストで「データなし」

**Step 2: 型チェック**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: コミット**

```bash
jj commit -m "feat: add SleepDetailSection component for day review"
```

---

## Task 8: ダッシュボード統合

**Files:**
- Modify: `app/(tabs)/index.tsx`

**Step 1: SleepCard をインポートして配置**

`app/(tabs)/index.tsx` で:
1. `useDailySummary` を `new Date()` で呼ぶ
2. 週間カレンダーセクションの下に `<SleepCard summary={todaySummary} />` を配置

```tsx
import { useDailySummary } from '../../src/hooks/useDailySummary';
import { SleepCard } from '../../src/components/sleep/SleepCard';

// コンポーネント内:
const todaySummary = useDailySummary(new Date());

// JSX: 週間カレンダーの下に:
<View style={commonStyles.section}>
  <SleepCard summary={todaySummary} />
</View>
```

**Step 2: 型チェック**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: コミット**

```bash
jj commit -m "feat: integrate SleepCard into dashboard"
```

---

## Task 9: 日別レビュー統合

**Files:**
- Modify: `app/day-review.tsx`

**Step 1: SleepDetailSection をインポートして配置**

`app/day-review.tsx` で:
1. `useDailySummary` を review 対象の日付で呼ぶ
2. 時刻情報セクションの下に `<SleepDetailSection summary={summary} />` を配置

```tsx
import { useDailySummary } from '../src/hooks/useDailySummary';
import { SleepDetailSection } from '../src/components/sleep/SleepDetailSection';

// コンポーネント内:
const reviewDate = useMemo(() => new Date(`${date}T00:00:00`), [date]);
const summary = useDailySummary(reviewDate);

// JSX: infoSection の下に:
<SleepDetailSection summary={summary} />
```

**Step 2: 型チェック**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: コミット**

```bash
jj commit -m "feat: integrate SleepDetailSection into day review"
```

---

## Task 10: 設定画面にヘルスケア連携トグル追加

**Files:**
- Modify: `app/(tabs)/settings.tsx`

**Step 1: ヘルスケア連携行を追加**

通知ステータスセクションの上に配置:

```tsx
import { initHealthKit, isHealthKitInitialized } from '../../src/services/health';

// store から取得:
const healthKitEnabled = useSettingsStore((s) => s.healthKitEnabled);
const setHealthKitEnabled = useSettingsStore((s) => s.setHealthKitEnabled);

const handleToggleHealthKit = useCallback(async (value: boolean) => {
  if (value) {
    const success = await initHealthKit();
    if (success) {
      await setHealthKitEnabled(true);
    }
  } else {
    await setHealthKitEnabled(false);
  }
}, [setHealthKitEnabled]);

// JSX:
<View style={commonStyles.section}>
  <View style={styles.row}>
    <Text style={styles.rowTitle}>{t('settings.healthKit')}</Text>
    <Switch
      value={healthKitEnabled}
      onValueChange={handleToggleHealthKit}
      trackColor={{ false: colors.disabled, true: colors.primary }}
      thumbColor={colors.text}
    />
  </View>
</View>
```

**Step 2: i18n キー追加**

`src/i18n/locales/ja/common.json` と `en/common.json` に:
- `settings.healthKit`: 「ヘルスケア連携」 / "Health Integration"

**Step 3: 型チェック**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: コミット**

```bash
jj commit -m "feat: add HealthKit toggle to settings screen"
```

---

## Task 11: 全体検証

**Step 1: 全テスト実行**

Run: `pnpm test`
Expected: ALL PASS

**Step 2: 型チェック**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Lint**

Run: `pnpm lint`
Expected: PASS (or fix with `pnpm lint:fix`)

**Step 4: 最終コミット**

```bash
jj commit -m "chore: verify sleep integration feature complete"
```

---

## タスク依存関係（並列実行マップ）

```
Task 1 (react-native-svg install)
Task 2 (i18n keys)
Task 3 (settings-store)
  ↓ すべて完了後
Task 4 (useDailySummary hook)
Task 5 (SleepTimelineBar)
  ↓ 両方完了後
Task 6 (SleepCard)
Task 7 (SleepDetailSection)
  ↓ 両方完了後
Task 8 (Dashboard integration)  ← Task 6 依存
Task 9 (Day review integration) ← Task 7 依存
Task 10 (Settings toggle)       ← Task 3 依存（並列可）
  ↓ すべて完了後
Task 11 (全体検証)
```

**並列実行可能なグループ:**
- **Wave 1:** Task 1 + Task 2 + Task 3（全て独立）
- **Wave 2:** Task 4 + Task 5（Task 1,2,3 完了後、互いに独立）
- **Wave 3:** Task 6 + Task 7 + Task 10（Task 4,5 完了後、互いに独立）
- **Wave 4:** Task 8 + Task 9（Task 6,7 完了後、互いに独立）
- **Wave 5:** Task 11（全完了後）
