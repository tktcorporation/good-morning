# 設定UXオーバーホール Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 日付変更ラインをドラムロール式ピッカー（24時間対応）に変更し、目標睡眠時間をメイン画面に統合する。

**Architecture:** settings-store の dayBoundaryHour の範囲を 0-23 に拡張。wake-target-store の bedtimeTarget を targetSleepMinutes に置換し、目標就寝時刻は純粋関数で算出。設定画面の BedtimePickerModal を削除し、メイン画面に SleepDurationCard を新設。

**Tech Stack:** React Native, Zustand, AsyncStorage, react-i18next, Picker（カスタム実装）

---

### Task 1: settings-store — dayBoundaryHour の範囲を 0-23 に拡張

**Files:**
- Modify: `src/stores/settings-store.ts:58-60`
- Modify: `src/__tests__/settings-store.test.ts:63-69`

**Step 1: テスト修正 — clamp 範囲を 0-23 に更新**

`src/__tests__/settings-store.test.ts` のテスト `setDayBoundaryHour clamps to 0-6 range` を更新:

```typescript
test('setDayBoundaryHour clamps to 0-23 range', async () => {
  await useSettingsStore.getState().loadSettings();
  await useSettingsStore.getState().setDayBoundaryHour(23);
  expect(useSettingsStore.getState().dayBoundaryHour).toBe(23);
  await useSettingsStore.getState().setDayBoundaryHour(24);
  expect(useSettingsStore.getState().dayBoundaryHour).toBe(23);
  await useSettingsStore.getState().setDayBoundaryHour(-1);
  expect(useSettingsStore.getState().dayBoundaryHour).toBe(0);
});
```

**Step 2: テスト実行 — 失敗を確認**

Run: `pnpm test -- --testPathPattern settings-store`
Expected: FAIL — 23 を設定しても 6 にクランプされる

**Step 3: 実装 — clamp 範囲を変更**

`src/stores/settings-store.ts:58-60` を変更:

```typescript
setDayBoundaryHour: async (hour: number) => {
  const clamped = Math.max(0, Math.min(23, hour));
  set({ dayBoundaryHour: clamped });
  await persist({ ...currentSettings(get), dayBoundaryHour: clamped });
},
```

**Step 4: テスト実行 — 成功を確認**

Run: `pnpm test -- --testPathPattern settings-store`
Expected: PASS

**Step 5: コミット**

```bash
jj commit -m "feat(settings-store): dayBoundaryHour の範囲を 0-23 に拡張

24時間のどこにでも日付変更ラインを設定できるように。
既存の 0-6 の値は引き続き有効でマイグレーション不要。"
```

---

### Task 2: wake-target — bedtimeTarget → targetSleepMinutes に置換

**Files:**
- Modify: `src/types/wake-target.ts:18-31,87-95`
- Modify: `src/stores/wake-target-store.ts:31,57-60,160-170`
- Modify: `src/__tests__/wake-target-store.test.ts:213-257`
- Create: `src/utils/sleep.ts`
- Create: `src/__tests__/sleep-utils.test.ts`

**Step 1: 純粋関数 calculateBedtime のテストを作成**

`src/__tests__/sleep-utils.test.ts`:

```typescript
import { calculateBedtime, migrateBedtimeToSleepMinutes } from '../utils/sleep';

describe('calculateBedtime', () => {
  test('基本ケース: アラーム6:00 - 7h = 23:00就寝', () => {
    expect(calculateBedtime({ hour: 6, minute: 0 }, 420)).toEqual({ hour: 23, minute: 0 });
  });

  test('深夜跨ぎ: アラーム7:30 - 8h = 23:30就寝', () => {
    expect(calculateBedtime({ hour: 7, minute: 30 }, 480)).toEqual({ hour: 23, minute: 30 });
  });

  test('同日: アラーム22:00 - 6h = 16:00就寝', () => {
    expect(calculateBedtime({ hour: 22, minute: 0 }, 360)).toEqual({ hour: 16, minute: 0 });
  });

  test('nullの場合: targetSleepMinutesがnull', () => {
    expect(calculateBedtime({ hour: 6, minute: 0 }, null)).toBeNull();
  });

  test('30分刻み: アラーム6:00 - 7.5h = 22:30就寝', () => {
    expect(calculateBedtime({ hour: 6, minute: 0 }, 450)).toEqual({ hour: 22, minute: 30 });
  });
});

describe('migrateBedtimeToSleepMinutes', () => {
  test('bedtimeTarget 23:00 + defaultTime 6:00 → 420分', () => {
    expect(migrateBedtimeToSleepMinutes(
      { hour: 23, minute: 0 },
      { hour: 6, minute: 0 },
    )).toBe(420);
  });

  test('bedtimeTarget 22:30 + defaultTime 6:30 → 480分', () => {
    expect(migrateBedtimeToSleepMinutes(
      { hour: 22, minute: 30 },
      { hour: 6, minute: 30 },
    )).toBe(480);
  });

  test('深夜跨ぎ: bedtimeTarget 1:00 + defaultTime 8:00 → 420分', () => {
    expect(migrateBedtimeToSleepMinutes(
      { hour: 1, minute: 0 },
      { hour: 8, minute: 0 },
    )).toBe(420);
  });

  test('300分より短い場合は300にクランプ', () => {
    expect(migrateBedtimeToSleepMinutes(
      { hour: 5, minute: 0 },
      { hour: 6, minute: 0 },
    )).toBe(300);
  });

  test('600分より長い場合は600にクランプ', () => {
    expect(migrateBedtimeToSleepMinutes(
      { hour: 18, minute: 0 },
      { hour: 6, minute: 0 },
    )).toBe(600);
  });
});
```

**Step 2: テスト実行 — 失敗を確認**

Run: `pnpm test -- --testPathPattern sleep-utils`
Expected: FAIL — モジュールが存在しない

**Step 3: sleep ユーティリティ実装**

`src/utils/sleep.ts`:

```typescript
import type { AlarmTime } from '../types/alarm';

/** 目標睡眠時間の最小値（5時間） */
export const MIN_SLEEP_MINUTES = 300;

/** 目標睡眠時間の最大値（10時間） */
export const MAX_SLEEP_MINUTES = 600;

/** 目標睡眠時間のステップ（30分） */
export const SLEEP_STEP_MINUTES = 30;

/**
 * アラーム時刻と目標睡眠時間から就寝目標時刻を算出する。
 *
 * 背景: 「何時に寝るか」ではなく「何時間寝るか」を設定し、
 * アラーム時刻から逆算して就寝時刻を自動表示する。
 * iOSヘルスケアの睡眠スケジュールと同じ考え方。
 *
 * @param alarmTime - アラーム時刻
 * @param targetSleepMinutes - 目標睡眠時間（分）。null なら未設定
 * @returns 就寝目標時刻。未設定なら null
 */
export function calculateBedtime(
  alarmTime: AlarmTime,
  targetSleepMinutes: number | null,
): AlarmTime | null {
  if (targetSleepMinutes === null) return null;

  const alarmTotalMinutes = alarmTime.hour * 60 + alarmTime.minute;
  let bedtimeMinutes = alarmTotalMinutes - targetSleepMinutes;

  // 負の値は前日として扱う（24時間分加算）
  if (bedtimeMinutes < 0) {
    bedtimeMinutes += 1440;
  }

  const hour = Math.floor(bedtimeMinutes / 60) % 24;
  const minute = bedtimeMinutes % 60;
  return { hour, minute };
}

/**
 * レガシーの bedtimeTarget + defaultTime から targetSleepMinutes を算出する。
 *
 * マイグレーション用: bedtimeTarget (AlarmTime) が保存されていた旧データを
 * targetSleepMinutes (number) に変換する。
 * MIN_SLEEP_MINUTES〜MAX_SLEEP_MINUTES の範囲にクランプ。
 */
export function migrateBedtimeToSleepMinutes(
  bedtimeTarget: AlarmTime,
  defaultTime: AlarmTime,
): number {
  const alarmMinutes = defaultTime.hour * 60 + defaultTime.minute;
  const bedtimeMinutes = bedtimeTarget.hour * 60 + bedtimeTarget.minute;

  let diff = alarmMinutes - bedtimeMinutes;
  if (diff <= 0) {
    diff += 1440;
  }

  return Math.max(MIN_SLEEP_MINUTES, Math.min(MAX_SLEEP_MINUTES, diff));
}

/**
 * 目標睡眠時間を表示用文字列に変換する。
 * 例: 420 → "7h", 450 → "7.5h"
 */
export function formatSleepDuration(minutes: number): string {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours}h`;
}
```

**Step 4: テスト実行 — 成功を確認**

Run: `pnpm test -- --testPathPattern sleep-utils`
Expected: PASS

**Step 5: WakeTarget 型を更新**

`src/types/wake-target.ts` — `bedtimeTarget: AlarmTime | null` を `targetSleepMinutes: number | null` に置換:

```typescript
export interface WakeTarget {
  readonly defaultTime: AlarmTime;
  readonly dayOverrides: Partial<Readonly<Record<DayOfWeek, DayOverride>>>;
  readonly nextOverride: NextOverride | null;
  readonly todos: readonly TodoItem[];
  readonly enabled: boolean;
  readonly soundId: string;
  /**
   * 目標睡眠時間（分）。Daily Grade System で夜の評価に使用。
   * null = 未設定（夜の判定は常に noData → 最大 good まで）。
   * excellent を取るには HealthKit 連携 + この値の設定が必要。
   * 就寝目標時刻は calculateBedtime(defaultTime, targetSleepMinutes) で算出。
   * 値は MIN_SLEEP_MINUTES (300) 〜 MAX_SLEEP_MINUTES (600) の範囲。
   */
  readonly targetSleepMinutes: number | null;
}
```

`DEFAULT_WAKE_TARGET` も更新:

```typescript
export const DEFAULT_WAKE_TARGET: WakeTarget = {
  defaultTime: { hour: 7, minute: 0 },
  dayOverrides: {},
  nextOverride: null,
  todos: [],
  enabled: true,
  soundId: DEFAULT_SOUND_ID,
  targetSleepMinutes: null,
};
```

**Step 6: wake-target-store のマイグレーションとメソッドを更新**

`src/stores/wake-target-store.ts` — `setBedtimeTarget` → `setTargetSleepMinutes`:

ストアインターフェースの `setBedtimeTarget` を削除し `setTargetSleepMinutes` を追加:
```typescript
setTargetSleepMinutes: (minutes: number | null) => Promise<void>;
```

loadTarget のマイグレーションロジックを更新:
```typescript
// bedtimeTarget → targetSleepMinutes マイグレーション
let targetSleepMinutes: number | null = null;
if (typeof parsed.targetSleepMinutes === 'number') {
  // 新しい形式
  targetSleepMinutes = parsed.targetSleepMinutes;
} else if (parsed.bedtimeTarget !== undefined && parsed.bedtimeTarget !== null) {
  // レガシー形式: bedtimeTarget から targetSleepMinutes を算出
  const { migrateBedtimeToSleepMinutes } = await import('../utils/sleep');
  const bt = parsed.bedtimeTarget as unknown as AlarmTime;
  const dt = (parsed as unknown as WakeTarget).defaultTime;
  targetSleepMinutes = migrateBedtimeToSleepMinutes(bt, dt);
}
```

setTargetSleepMinutes の実装:
```typescript
setTargetSleepMinutes: async (minutes: number | null) => {
  const { target } = get();
  if (target === null) return;
  const updated: WakeTarget = { ...target, targetSleepMinutes: minutes };
  set({ target: updated });
  await persist(updated);
},
```

**Step 7: wake-target-store テストを更新**

`src/__tests__/wake-target-store.test.ts` — setBedtimeTarget テストを setTargetSleepMinutes に変更:

```typescript
test('setTargetSleepMinutes sets and persists', async () => {
  await useWakeTargetStore.getState().setTarget(DEFAULT_WAKE_TARGET);
  mockSetItem.mockClear();
  await useWakeTargetStore.getState().setTargetSleepMinutes(420);
  expect(useWakeTargetStore.getState().target?.targetSleepMinutes).toBe(420);
  expect(mockSetItem).toHaveBeenCalledWith(
    'wake-target',
    expect.stringContaining('"targetSleepMinutes":420'),
  );
});

test('setTargetSleepMinutes(null) clears', async () => {
  await useWakeTargetStore.getState().setTarget({
    ...DEFAULT_WAKE_TARGET,
    targetSleepMinutes: 420,
  });
  mockSetItem.mockClear();
  await useWakeTargetStore.getState().setTargetSleepMinutes(null);
  expect(useWakeTargetStore.getState().target?.targetSleepMinutes).toBeNull();
});

test('loadTarget migrates legacy bedtimeTarget to targetSleepMinutes', async () => {
  const legacyTarget = {
    defaultTime: { hour: 6, minute: 0 },
    dayOverrides: {},
    nextOverride: null,
    todos: [],
    enabled: true,
    soundId: 'default',
    bedtimeTarget: { hour: 23, minute: 0 },
  };
  mockGetItem.mockImplementation((key: string) => {
    if (key === 'wake-target') return Promise.resolve(JSON.stringify(legacyTarget));
    return Promise.resolve(null);
  });
  await useWakeTargetStore.getState().loadTarget();
  expect(useWakeTargetStore.getState().target?.targetSleepMinutes).toBe(420);
});

test('loadTarget handles legacy data without bedtimeTarget or targetSleepMinutes', async () => {
  const legacyTarget = {
    defaultTime: { hour: 7, minute: 0 },
    dayOverrides: {},
    nextOverride: null,
    todos: [],
    enabled: true,
    soundId: 'default',
  };
  mockGetItem.mockImplementation((key: string) => {
    if (key === 'wake-target') return Promise.resolve(JSON.stringify(legacyTarget));
    return Promise.resolve(null);
  });
  await useWakeTargetStore.getState().loadTarget();
  expect(useWakeTargetStore.getState().target?.targetSleepMinutes).toBeNull();
});
```

**Step 8: テスト実行**

Run: `pnpm test -- --testPathPattern wake-target`
Expected: PASS

**Step 9: コミット**

```bash
jj commit -m "feat(wake-target): bedtimeTarget → targetSleepMinutes に置換

目標就寝時間ベースから目標睡眠時間ベースに変更。
就寝時刻はアラーム時刻から逆算して純粋関数で算出。
レガシーの bedtimeTarget データは自動マイグレーション。"
```

---

### Task 3: grade-finalizer — targetSleepMinutes 対応

**Files:**
- Modify: `src/services/grade-finalizer.ts:29-33`
- Modify: `src/hooks/useGradeFinalization.ts:154`
- Modify: `src/__tests__/grade-finalizer.test.ts`

**Step 1: grade-finalizer.test.ts を更新**

buildGradeRecord のシグネチャは `bedtimeTarget: AlarmTime | null` のまま。
変更が必要なのは呼び出し元の useGradeFinalization で、`targetSleepMinutes` + `defaultTime` から `bedtimeTarget` を算出して渡す部分。

grade-finalizer.ts 自体は `bedtimeTarget: AlarmTime | null` を受け取る純粋関数なので変更不要。

**useGradeFinalization の変更:**

```typescript
// 旧: const bedtimeTarget = target?.bedtimeTarget ?? null;
// 新: targetSleepMinutes から bedtimeTarget を算出
const bedtimeTarget = target !== null
  ? calculateBedtime(target.defaultTime, target.targetSleepMinutes ?? null)
  : null;
```

import を追加:
```typescript
import { calculateBedtime } from '../utils/sleep';
```

**Step 2: 既存テスト実行 — grade-finalizer テストが通ることを確認**

Run: `pnpm test -- --testPathPattern grade-finalizer`
Expected: PASS (buildGradeRecord のシグネチャは変更なし)

**Step 3: コミット**

```bash
jj commit -m "fix(grade-finalization): targetSleepMinutes から bedtimeTarget を算出

useGradeFinalization で calculateBedtime を使い、
目標睡眠時間 + デフォルトアラーム時刻から就寝目標を算出して
buildGradeRecord に渡す。"
```

---

### Task 4: DayBoundaryPicker — 新UIコンポーネント

**Files:**
- Create: `src/components/DayBoundaryPicker.tsx`
- Delete: `src/components/DayBoundarySlider.tsx`
- Modify: `app/(tabs)/settings.tsx:7,196-201`

**Step 1: DayBoundaryPicker コンポーネントを作成**

`src/components/DayBoundaryPicker.tsx`:

ドラムロール風のスクロールリスト。ボトムシートモーダルで 0:00〜23:00 の 24 項目を表示。
確認・キャンセルボタン付き。現在の値がハイライトされるスクロール位置に自動移動。

```typescript
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '@/constants/theme';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const ITEM_HEIGHT = 48;
const VISIBLE_ITEMS = 5;

interface DayBoundaryPickerProps {
  value: number;
  onValueChange: (value: number) => void;
}

/**
 * 日付変更ラインの時刻を選択するピッカー。
 *
 * 背景: スライダーUIが操作しにくいというフィードバックを受け、
 * iOSのヘルスケアアプリに倣ったドラムロール風のピッカーに変更。
 * 0〜23時から1時間刻みで選択可能。
 *
 * 使用箇所: app/(tabs)/settings.tsx の Day Boundary セクション
 */
export function DayBoundaryPicker({ value, onValueChange }: DayBoundaryPickerProps) {
  const { t } = useTranslation('common');
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedHour, setSelectedHour] = useState(value);
  const flatListRef = useRef<FlatList>(null);

  const handleOpen = useCallback(() => {
    setSelectedHour(value);
    setModalVisible(true);
  }, [value]);

  const handleSave = useCallback(() => {
    onValueChange(selectedHour);
    setModalVisible(false);
  }, [selectedHour, onValueChange]);

  const handleClose = useCallback(() => {
    setModalVisible(false);
  }, []);

  const handleSelect = useCallback((hour: number) => {
    setSelectedHour(hour);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: number }) => {
      const isSelected = item === selectedHour;
      return (
        <Pressable
          style={[styles.item, isSelected && styles.itemSelected]}
          onPress={() => handleSelect(item)}
        >
          <Text style={[styles.itemText, isSelected && styles.itemTextSelected]}>
            {t('settings.dayBoundaryHour', { hour: item })}
          </Text>
        </Pressable>
      );
    },
    [selectedHour, handleSelect, t],
  );

  return (
    <>
      <Pressable style={styles.trigger} onPress={handleOpen}>
        <Text style={styles.triggerText}>
          {t('settings.dayBoundaryHour', { hour: value })}
        </Text>
        <Text style={styles.chevron}>{'>'}</Text>
      </Pressable>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
        onShow={() => {
          // 現在値までスクロール
          setTimeout(() => {
            flatListRef.current?.scrollToIndex({
              index: Math.max(0, value - 2),
              animated: false,
            });
          }, 100);
        }}
      >
        <Pressable style={styles.overlay} onPress={handleClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.title}>{t('settings.dayBoundary')}</Text>
            <Text style={styles.description}>
              {t('settings.dayBoundaryDescription')}
            </Text>

            <View style={styles.listContainer}>
              <FlatList
                ref={flatListRef}
                data={HOURS}
                renderItem={renderItem}
                keyExtractor={(item) => `hour-${item}`}
                getItemLayout={(_, index) => ({
                  length: ITEM_HEIGHT,
                  offset: ITEM_HEIGHT * index,
                  index,
                })}
                showsVerticalScrollIndicator={false}
                style={styles.list}
              />
            </View>

            <View style={styles.buttonRow}>
              <Pressable style={styles.textButton} onPress={handleClose}>
                <Text style={styles.textButtonLabel}>{t('cancel')}</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={handleSave}>
                <Text style={styles.primaryButtonLabel}>{t('save')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
```

スタイルは BedtimePickerModal のパターンに合わせる（overlay, sheet, buttonRow など）。

**Step 2: settings.tsx — DayBoundarySlider → DayBoundaryPicker に差し替え**

import 変更:
```typescript
// 旧: import { DayBoundarySlider } from '../../src/components/DayBoundarySlider';
// 新:
import { DayBoundaryPicker } from '../../src/components/DayBoundaryPicker';
```

JSX 変更 (Day Boundary セクション):
```tsx
{/* Day Boundary */}
<View style={commonStyles.section}>
  <Text style={commonStyles.sectionTitle}>{t('settings.dayBoundary')}</Text>
  <DayBoundaryPicker value={dayBoundaryHour} onValueChange={handleDayBoundaryChange} />
</View>
```

**Step 3: DayBoundarySlider.tsx を削除**

`src/components/DayBoundarySlider.tsx` を削除する。

**Step 4: Lint & typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS

**Step 5: コミット**

```bash
jj commit -m "feat(settings): DayBoundarySlider → DayBoundaryPicker に置換

ドラムロール風の選択UIに変更。0-23時の24時間から選択可能。
ボトムシートモーダルで一覧表示し、タップで選択。
DayBoundarySlider.tsx を削除。"
```

---

### Task 5: SleepDurationCard — メイン画面の睡眠情報カード

**Files:**
- Create: `src/components/SleepDurationCard.tsx`
- Create: `src/components/SleepDurationPickerModal.tsx`
- Modify: `app/(tabs)/index.tsx`

**Step 1: SleepDurationPickerModal を作成**

`src/components/SleepDurationPickerModal.tsx`:

睡眠時間を選択するボトムシートモーダル。
5h〜10h の 11 項目を FlatList で表示。BedtimePickerModal と同じレイアウトパターン。

```typescript
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '@/constants/theme';
import {
  MAX_SLEEP_MINUTES,
  MIN_SLEEP_MINUTES,
  SLEEP_STEP_MINUTES,
  formatSleepDuration,
} from '@/utils/sleep';

const OPTIONS: number[] = [];
for (let m = MIN_SLEEP_MINUTES; m <= MAX_SLEEP_MINUTES; m += SLEEP_STEP_MINUTES) {
  OPTIONS.push(m);
}

const ITEM_HEIGHT = 48;

interface SleepDurationPickerModalProps {
  visible: boolean;
  currentValue: number | null;
  onSave: (value: number | null) => void;
  onClose: () => void;
}

export function SleepDurationPickerModal({
  visible,
  currentValue,
  onSave,
  onClose,
}: SleepDurationPickerModalProps) {
  const { t } = useTranslation('common');
  const [selected, setSelected] = useState<number>(currentValue ?? 420);
  const flatListRef = useRef<FlatList>(null);

  const handleShow = useCallback(() => {
    const val = currentValue ?? 420;
    setSelected(val);
    const index = OPTIONS.indexOf(val);
    if (index >= 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: Math.max(0, index - 2),
          animated: false,
        });
      }, 100);
    }
  }, [currentValue]);

  const renderItem = useCallback(
    ({ item }: { item: number }) => {
      const isSelected = item === selected;
      return (
        <Pressable
          style={[styles.item, isSelected && styles.itemSelected]}
          onPress={() => setSelected(item)}
        >
          <Text style={[styles.itemText, isSelected && styles.itemTextSelected]}>
            {formatSleepDuration(item)}
          </Text>
        </Pressable>
      );
    },
    [selected],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onShow={handleShow}
      onRequestClose={onClose}
    >
      {/* ... overlay, sheet, buttonRow — DayBoundaryPicker と同パターン */}
    </Modal>
  );
}
```

**Step 2: SleepDurationCard を作成**

`src/components/SleepDurationCard.tsx`:

```typescript
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '@/constants/theme';
import type { AlarmTime } from '@/types/alarm';
import { formatTime } from '@/types/alarm';
import { calculateBedtime, formatSleepDuration } from '@/utils/sleep';
import { SleepDurationPickerModal } from './SleepDurationPickerModal';

interface SleepDurationCardProps {
  alarmTime: AlarmTime | null;
  targetSleepMinutes: number | null;
  onSleepMinutesChange: (minutes: number | null) => void;
}

/**
 * メイン画面のアラーム時刻の下に表示する睡眠カード。
 *
 * 目標睡眠時間と算出された就寝時刻を表示。
 * タップすると睡眠時間ピッカーが開く。
 */
export function SleepDurationCard({
  alarmTime,
  targetSleepMinutes,
  onSleepMinutesChange,
}: SleepDurationCardProps) {
  const { t } = useTranslation('dashboard');
  const [pickerVisible, setPickerVisible] = useState(false);

  const bedtime = useMemo(
    () => (alarmTime !== null ? calculateBedtime(alarmTime, targetSleepMinutes) : null),
    [alarmTime, targetSleepMinutes],
  );

  const handleSave = useCallback(
    (value: number | null) => {
      onSleepMinutesChange(value);
      setPickerVisible(false);
    },
    [onSleepMinutesChange],
  );

  if (targetSleepMinutes === null) {
    return (
      <Pressable style={styles.card} onPress={() => setPickerVisible(true)}>
        <Text style={styles.setupText}>{t('sleep.setup')}</Text>
        <SleepDurationPickerModal
          visible={pickerVisible}
          currentValue={null}
          onSave={handleSave}
          onClose={() => setPickerVisible(false)}
        />
      </Pressable>
    );
  }

  return (
    <>
      <Pressable style={styles.card} onPress={() => setPickerVisible(true)}>
        <Text style={styles.sleepInfo}>
          {formatSleepDuration(targetSleepMinutes)}
          {bedtime !== null ? ` → ${formatTime(bedtime)} ${t('sleep.bedtime')}` : ''}
        </Text>
      </Pressable>
      <SleepDurationPickerModal
        visible={pickerVisible}
        currentValue={targetSleepMinutes}
        onSave={handleSave}
        onClose={() => setPickerVisible(false)}
      />
    </>
  );
}
```

**Step 3: メイン画面 (index.tsx) に SleepDurationCard を組み込む**

Target Time Display セクションの下に追加:

```tsx
const setTargetSleepMinutes = useWakeTargetStore((s) => s.setTargetSleepMinutes);

// ... 既存の targetSection の後に:
<SleepDurationCard
  alarmTime={resolvedTime}
  targetSleepMinutes={target?.targetSleepMinutes ?? null}
  onSleepMinutesChange={setTargetSleepMinutes}
/>
```

**Step 4: i18n キーを追加**

`src/i18n/locales/ja/dashboard.json` に追加:
```json
"sleep": {
  "setup": "目標睡眠時間を設定",
  "bedtime": "就寝"
}
```

`src/i18n/locales/en/dashboard.json` に追加:
```json
"sleep": {
  "setup": "Set sleep goal",
  "bedtime": "bedtime"
}
```

**Step 5: Lint & typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS

**Step 6: コミット**

```bash
jj commit -m "feat(dashboard): SleepDurationCard をメイン画面に統合

アラーム時刻の下に「7h → 23:00 就寝」の睡眠情報カードを表示。
タップで目標睡眠時間を変更できるピッカーモーダルを開く。"
```

---

### Task 6: 設定画面クリーンアップ — BedtimePickerModal 削除

**Files:**
- Delete: `src/components/BedtimePickerModal.tsx`
- Modify: `app/(tabs)/settings.tsx`

**Step 1: settings.tsx から Bedtime セクションを削除**

以下を削除:
- import の `BedtimePickerModal`
- `setBedtimeTarget` ストアフック
- `bedtimeModalVisible` state
- `handleBedtimeSave` callback
- `bedtimeDisplay` useMemo
- JSX の `{/* Bedtime Target */}` セクション全体
- `<BedtimePickerModal .../>` コンポーネント

**Step 2: BedtimePickerModal.tsx を削除**

`src/components/BedtimePickerModal.tsx` を削除する。

**Step 3: 不要な i18n キーを削除**

`src/i18n/locales/ja/common.json` と `src/i18n/locales/en/common.json` から以下を削除:
- `settings.bedtimeTarget`
- `settings.bedtimeTargetDescription`
- `settings.bedtimeNotSet`
- `settings.bedtimeClear`
- `settings.bedtimeSave`
- `settings.bedtimeCancel`

**Step 4: i18n の dayBoundaryDescription を更新**

日本語: `"dayBoundaryDescription": "この時刻より前は前日として扱います"`（変更なし、24時間対応で問題なし）

**Step 5: Lint & typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS

**Step 6: コミット**

```bash
jj commit -m "refactor(settings): BedtimePickerModal を削除

目標就寝時間の設定はメイン画面の SleepDurationCard に統合したため、
設定画面の Bedtime セクションと BedtimePickerModal を削除。"
```

---

### Task 7: TypeScript 全体チェック & テスト全通し

**Files:**
- All modified files

**Step 1: 全テスト実行**

Run: `pnpm test`
Expected: PASS

**Step 2: 型チェック**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Lint**

Run: `pnpm lint`
Expected: PASS

**Step 4: bedtimeTarget の参照が残っていないか確認**

Run: `grep -r "bedtimeTarget" src/ app/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v "__tests__"`

Expected: grade-finalizer.ts と grade-calculator.ts のみ（DailyGradeRecord.bedtimeTarget は HH:mm 文字列として残る）

**Step 5: コミット（修正があれば）**

```bash
jj commit -m "fix: 全テスト・型チェック・lint 通過を確認"
```

---

### Task 8: ユーザーフロー検証 & データ整合性テスト

**Files:**
- Modify: `src/__tests__/settings-store.test.ts` (追加テスト)
- Modify: `src/__tests__/wake-target-store.test.ts` (追加テスト)

**Step 1: データ整合性のテストを追加**

settings-store テストに追加:

```typescript
test('dayBoundaryHour変更後も既存設定が保持される', async () => {
  mockGetItem.mockResolvedValue(JSON.stringify({
    dayBoundaryHour: 3,
    healthKitEnabled: true,
    alarmKitGranted: true,
  }));
  await useSettingsStore.getState().loadSettings();
  await useSettingsStore.getState().setDayBoundaryHour(12);
  expect(useSettingsStore.getState().dayBoundaryHour).toBe(12);
  expect(useSettingsStore.getState().healthKitEnabled).toBe(true);
  expect(useSettingsStore.getState().alarmKitGranted).toBe(true);
});
```

**Step 2: ユーザーフロー検証ドキュメント作成**

`docs/user-flows.md` に追加（既存ファイルがあれば追記）:

```markdown
## 設定UXオーバーホール — ユーザーフロー検証

### フロー1: 初回設定
1. アプリ初回起動 → メイン画面
2. アラーム時刻設定済み、目標睡眠時間は未設定
3. 「目標睡眠時間を設定」リンクが表示される
4. タップ → ピッカーモーダル → 7h を選択 → 保存
5. メイン画面に「7h → 23:00 就寝」と表示
6. ✅ 成立

### フロー2: 日付変更ライン変更
1. 設定画面 → Day Boundary セクション
2. 現在値「3:00」が表示される
3. タップ → ボトムシートモーダル → 12:00 を選択 → 保存
4. 既存の WakeRecord はそのまま保持
5. 新しいレコードは 12:00 境界で日付決定
6. ✅ 成立

### フロー3: 海外渡航シナリオ
1. 日本で dayBoundary=3 で使用
2. 渡航先で dayBoundary=12 に変更
3. 既存レコードは消えない（date は記録時点の値）
4. 新しいレコードは新 boundary で記録
5. 統計は alarmTriggeredAt ベースで表示可能
6. ✅ 成立

### フロー4: Daily Grade との連携
1. 目標睡眠時間 7h + アラーム 6:00 → 就寝目標 23:00
2. HealthKit が 22:50 就寝を検知
3. evaluateBedtime(22:50, 23, 0) → onTime
4. morningPass + onTime → excellent
5. ✅ 成立

### フロー5: 機能不全チェック — 曜日オーバーライド
1. デフォルト 6:00、土曜 8:00 のオーバーライドあり
2. 金曜夜に見ると「7h → 01:00 就寝」と表示される（8:00 - 7h）
3. ✅ 正しい（resolvedTime が曜日ごとに変わる）

### フロー6: アラームOFF時
1. アラームが無効 → resolvedTime = null
2. SleepDurationCard は alarmTime=null を受け取る
3. bedtime = null → 睡眠情報は表示されるが就寝時刻なし
4. ✅ 成立（設定は保持されるがアラームOFF時は就寝時刻非表示）
```

**Step 3: テスト実行 — 全通し**

Run: `pnpm test`
Expected: PASS

**Step 4: コミット**

```bash
jj commit -m "test: データ整合性テスト追加 & ユーザーフロー検証

海外渡航・生活習慣変更・Daily Grade連携のシナリオを検証。"
```
