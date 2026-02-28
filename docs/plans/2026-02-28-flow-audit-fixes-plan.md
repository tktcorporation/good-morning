# フロー監査修正 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** フロー調査で発見した16件の問題 + デッドコード削除を修正する

**Architecture:** 3グループに分けて段階的に修正。(A) スヌーズ・セッションのライフサイクル、(B) WakeRecord の堅牢性、(C) ドキュメント・デッドコード・エッジケース。各タスクは TDD で進め、既存テストが壊れていないことを頻繁に確認する。

**Tech Stack:** Expo/React Native, TypeScript, Zustand, Jest, pnpm

---

## Task 1: デッドコード削除 (WakeTarget の未使用メソッド)

**Files:**
- Modify: `src/stores/wake-target-store.ts:33-43,191-215`
- Modify: `src/__tests__/wake-target-store.test.ts:122-153`

**Step 1: テスト削除**

`src/__tests__/wake-target-store.test.ts` から以下の3テストを削除:
- `toggleTodoCompleted flips todo completed state` (L122-129)
- `resetTodos sets all todos to not completed` (L131-142)
- `areAllTodosCompleted returns true when all done` (L144-153)

**Step 2: ストアからメソッド削除**

`src/stores/wake-target-store.ts` から以下を削除:
- interface の `toggleTodoCompleted` 宣言 (L33-37)
- interface の `resetTodos` 宣言 (L38-42)
- interface の `areAllTodosCompleted` 宣言 (L43)
- 実装の `toggleTodoCompleted` (L191-199)
- 実装の `resetTodos` (L201-209)
- 実装の `areAllTodosCompleted` (L211-215)

**Step 3: テスト実行**

Run: `pnpm test -- --testPathPattern=wake-target-store`
Expected: 既存テストが全て PASS

**Step 4: 型チェック**

Run: `pnpm typecheck`
Expected: エラーなし（他のファイルから参照されていないことの確認）

**Step 5: コミット**

```bash
jj commit -m "refactor: WakeTarget の未使用メソッド削除 (toggleTodoCompleted, resetTodos, areAllTodosCompleted)"
```

---

## Task 2: WakeRecord 日付重複防止 (M2)

**Files:**
- Modify: `src/stores/wake-record-store.ts:63-73`
- Modify: `src/__tests__/wake-record-store.test.ts`

**Step 1: 失敗するテストを書く**

`src/__tests__/wake-record-store.test.ts` に追加:

```typescript
test('addRecord with duplicate date updates existing record instead of adding', async () => {
  const first = await useWakeRecordStore.getState().addRecord({
    alarmId: 'wake-target',
    date: '2026-02-28',
    targetTime: { hour: 7, minute: 0 },
    alarmTriggeredAt: '2026-02-28T07:00:00Z',
    dismissedAt: '2026-02-28T07:01:00Z',
    healthKitWakeTime: null,
    result: 'great',
    diffMinutes: 1,
    todos: [],
    todoCompletionSeconds: 0,
    alarmLabel: '',
    todosCompleted: true,
    todosCompletedAt: '2026-02-28T07:01:00Z',
  });

  const second = await useWakeRecordStore.getState().addRecord({
    alarmId: 'wake-target',
    date: '2026-02-28',
    targetTime: { hour: 7, minute: 0 },
    alarmTriggeredAt: '2026-02-28T07:05:00Z',
    dismissedAt: '2026-02-28T07:06:00Z',
    healthKitWakeTime: null,
    result: 'ok',
    diffMinutes: 6,
    todos: [],
    todoCompletionSeconds: 0,
    alarmLabel: '',
    todosCompleted: true,
    todosCompletedAt: '2026-02-28T07:06:00Z',
  });

  const records = useWakeRecordStore.getState().records;
  // 重複せず1件のまま
  expect(records.filter(r => r.date === '2026-02-28')).toHaveLength(1);
  // 既存レコードの ID が維持される
  expect(second.id).toBe(first.id);
  // 新しいデータで上書きされている
  expect(records.find(r => r.id === first.id)?.result).toBe('ok');
});
```

**Step 2: テスト実行して失敗を確認**

Run: `pnpm test -- --testPathPattern=wake-record-store`
Expected: 新しいテストが FAIL（重複レコードが2件になるため）

**Step 3: addRecord に日付重複チェックを実装**

`src/stores/wake-record-store.ts` の `addRecord` を修正:

```typescript
addRecord: async (data: Omit<WakeRecord, 'id'>): Promise<WakeRecord> => {
  // 同日のレコードが既にある場合は上書き更新（2回連続 dismiss 等のエッジケース対策）
  const existing = get().records.find((r) => r.date === data.date);
  if (existing !== undefined) {
    const merged: WakeRecord = { ...existing, ...data, id: existing.id };
    const updated = get().records.map((r) => (r.id === existing.id ? merged : r));
    set({ records: updated });
    await persistRecords(updated);
    return merged;
  }

  const record: WakeRecord = {
    id: createWakeRecordId(),
    ...data,
  };
  const updated = [...get().records, record];
  set({ records: updated });
  await persistRecords(updated);
  return record;
},
```

**Step 4: テスト実行して成功を確認**

Run: `pnpm test -- --testPathPattern=wake-record-store`
Expected: 全テスト PASS

**Step 5: コミット**

```bash
jj commit -m "fix: 同日の WakeRecord 重複を防止 — addRecord で既存レコードを上書き"
```

---

## Task 3: dismiss 処理の堅牢化 (M1, L2)

**Files:**
- Modify: `app/wakeup.tsx:84-185`

**Step 1: dismiss 処理中フラグ追加 (L2)**

`app/wakeup.tsx` に状態を追加:

```typescript
const [dismissing, setDismissing] = useState(false);
```

`handleDismiss` の冒頭にガードを追加:

```typescript
const handleDismiss = useCallback(() => {
  if (dismissing) return;
  setDismissing(true);

  // ... 既存のロジック
}, [dismissing, /* ... existing deps */]);
```

**Step 2: catch ブロックのエラーハンドリング改善 (M1)**

`app/wakeup.tsx` の catch ブロックを修正:

```typescript
.catch((e: unknown) => {
  // biome-ignore lint/suspicious/noConsole: dismiss フローを中断しないが、デバッグ用にエラーは記録する
  console.error('[WakeUp] Failed to save record:', e);
  // dismiss 自体は完了しているため、ユーザーに通知するが操作はブロックしない。
  // 次回のアラームで新しい WakeRecord が作成される。
  Alert.alert(
    t('error.title'),
    t('error.recordSaveFailed'),
  );
});
```

Alert の import を追加: `import { Alert, Pressable, ... } from 'react-native';`

**Step 3: 型チェック**

Run: `pnpm typecheck`
Expected: エラーなし

**Step 4: コミット**

```bash
jj commit -m "fix: dismiss 処理の堅牢化 — 2回連続タップ防止 + addRecord 失敗時のユーザー通知"
```

---

## Task 4: TODO全完了時のスヌーズキャンセル修正 (H1)

**Files:**
- Modify: `app/(tabs)/index.tsx:12-17,121-160`

**Step 1: import 追加**

`app/(tabs)/index.tsx` に `scheduleWakeTargetAlarm` の import を追加:

```typescript
import {
  cancelAllAlarms,       // 追加
  cancelSnoozeAlarms,    // 既存（削除）
  endLiveActivity,
  isAlarmKitAvailable,
  scheduleWakeTargetAlarm, // 追加
  updateLiveActivity,
} from '../../src/services/alarm-kit';
```

**Step 2: completion effect を修正**

`app/(tabs)/index.tsx` の completion effect (L121-160) を修正:

```typescript
// Complete session when all todos are done
useEffect(() => {
  if (session === null || !areAllCompleted()) return;

  // アプリ再起動後は snoozeAlarmIds が消失するため、ID ベースのキャンセルではなく
  // ネイティブ側の全アラームをキャンセルする。その後、通常の wake target アラームを
  // 再スケジュールして翌朝のアラームを復元する。
  void cancelAllAlarms().then(() => {
    const currentTarget = useWakeTargetStore.getState().target;
    if (currentTarget !== null && currentTarget.enabled) {
      scheduleWakeTargetAlarm(currentTarget).then((newIds) => {
        useWakeTargetStore.getState().setAlarmIds(newIds);
      });
    }
  });

  const now = new Date();
  const todosCompletedAt = now.toISOString();
  const todoCompletionSeconds = Math.round(
    (now.getTime() - new Date(session.startedAt).getTime()) / 1000,
  );

  const todoRecords: readonly WakeTodoRecord[] = session.todos.map((todo, index) => ({
    id: todo.id,
    title: todo.title,
    completedAt: todo.completedAt,
    orderCompleted: todo.completed ? index + 1 : null,
  }));

  // clearSession でセッションの liveActivityId が消える前に Live Activity を終了する
  const activityId = useMorningSessionStore.getState().session?.liveActivityId ?? null;
  if (activityId !== null) {
    endLiveActivity(activityId);
  }

  updateRecord(session.recordId, {
    todosCompleted: true,
    todosCompletedAt,
    todoCompletionSeconds,
    todos: todoRecords,
  }).then(() => clearSession());
}, [session, areAllCompleted, updateRecord, clearSession]);
```

`cancelSnoozeAlarms` の import を削除。

**Step 3: 型チェック**

Run: `pnpm typecheck`
Expected: エラーなし

**Step 4: コミット**

```bash
jj commit -m "fix(H1): TODO全完了時に cancelAllAlarms + 再スケジュールでスヌーズを確実にキャンセル"
```

---

## Task 5: 設定変更時のスヌーズ保護 (M4)

**Files:**
- Modify: `app/_layout.tsx:137-150`

**Step 1: target effect にセッションガードを追加**

`app/_layout.tsx` の target effect を修正:

```typescript
// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only reacting to target changes to avoid infinite loop
useEffect(() => {
  if (target === null) return;

  // アクティブセッション中は target 変更によるアラーム再スケジュールをスキップ。
  // cancelAllAlarms がスヌーズを巻き添えでキャンセルしてしまうのを防ぐ。
  // セッション完了後の completion effect (index.tsx) で再スケジュールされる。
  if (useMorningSessionStore.getState().isActive()) return;

  if (target.enabled) {
    scheduleWakeTargetAlarm(target).then((newIds) => {
      setAlarmIds(newIds);
    });
  } else {
    cancelAllAlarms().then(() => {
      setAlarmIds([]);
    });
  }
}, [target]);
```

**Step 2: 型チェック**

Run: `pnpm typecheck`
Expected: エラーなし

**Step 3: コミット**

```bash
jj commit -m "fix(M4): アクティブセッション中は target 変更でアラーム再スケジュールしない"
```

---

## Task 6: 期限切れセッションのクリーンアップ (M3, M5)

**Files:**
- Modify: `app/_layout.tsx:51-108`

**Step 1: import 追加**

`app/_layout.tsx` に追加:
```typescript
import { useSettingsStore } from '../src/stores/settings-store';  // 既存
import { getLogicalDateString } from '../src/utils/date';  // 追加
```

**Step 2: 初期化 effect に期限切れセッションのクリーンアップを追加**

`app/_layout.tsx` の初期化 effect 内、`sessionLoaded.then(...)` を修正。通常起動のブロック (L85-103) を以下に置き換え:

```typescript
} else {
  // アラーム経由でない通常起動（ホーム画面タップ等）の場合。
  sessionLoaded.then(() => {
    const state = useMorningSessionStore.getState();
    if (state.session === null) return;

    const dayBoundaryHour = useSettingsStore.getState().dayBoundaryHour;
    const today = getLogicalDateString(new Date(), dayBoundaryHour);

    if (state.session.date !== today) {
      // 前日以前のセッションが残っている場合はクリーンアップ。
      // 深夜0時跨ぎや、前回アプリ kill で clearSession が呼ばれなかった場合に発生。
      if (state.session.liveActivityId !== null) {
        endLiveActivity(state.session.liveActivityId);
      }
      state.clearSession();
      return;
    }

    // 当日のセッションで TODO 全完了済みだが Live Activity が残っている場合のクリーンアップ
    if (
      state.areAllCompleted() &&
      state.session.liveActivityId !== null
    ) {
      endLiveActivity(state.session.liveActivityId);
    }
  });
}
```

同様に、アラーム起動時（`router.push('/wakeup')` の前）にも古いセッションのクリーンアップを追加:

```typescript
} else {
  // 初回アラーム: 古いセッションが残っていればクリーンアップしてから wakeup 画面へ
  sessionLoaded.then(() => {
    const state = useMorningSessionStore.getState();
    if (state.session !== null) {
      const dayBoundaryHour = useSettingsStore.getState().dayBoundaryHour;
      const today = getLogicalDateString(new Date(), dayBoundaryHour);
      if (state.session.date !== today) {
        if (state.session.liveActivityId !== null) {
          endLiveActivity(state.session.liveActivityId);
        }
        state.clearSession();
      }
    }
  });
  router.push('/wakeup');
}
```

**Step 3: 型チェック**

Run: `pnpm typecheck`
Expected: エラーなし

**Step 4: コミット**

```bash
jj commit -m "fix(M3,M5): 期限切れセッションのクリーンアップ — 深夜跨ぎ・前日残存対応"
```

---

## Task 7: wakeup 画面のフォールバックUI改善 (L3)

**Files:**
- Modify: `app/wakeup.tsx:187-196`

**Step 1: フォールバックUIをローディング表示に変更**

```typescript
if (target === null) {
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.loadingText}>{tCommon('loading')}</Text>
    </View>
  );
}
```

`styles.loadingText` を追加:
```typescript
loadingText: {
  color: colors.textSecondary,
  fontSize: fontSize.lg,
  textAlign: 'center',
  marginTop: spacing.xxl,
},
```

`styles.errorText` は不要になるため削除。

**Step 2: 型チェック**

Run: `pnpm typecheck`
Expected: エラーなし

**Step 3: コミット**

```bash
jj commit -m "fix(L3): wakeup 画面のフォールバックをエラーからローディング表示に変更"
```

---

## Task 8: useGradeFinalization での missed 明示化 (H3)

**Files:**
- Modify: `src/hooks/useGradeFinalization.ts:97-113`

**Step 1: finalizeDay にコメント追加**

`src/hooks/useGradeFinalization.ts` の `finalizeDay` 関数内、L109 付近:

```typescript
async function finalizeDay(
  dateStr: string,
  yesterdayStr: string,
  records: readonly WakeRecord[],
  bedtimeTarget: AlarmTime | null,
  healthKitEnabled: boolean,
  date: Date,
  getGradeForDate: (d: string) => DailyGradeRecord | undefined,
  addGrade: (record: DailyGradeRecord) => Promise<void>,
): Promise<void> {
  if (getGradeForDate(dateStr) !== undefined) return;

  // WakeRecord が見つからない場合、buildGradeRecord は record=undefined として処理する。
  // これは「アラームが鳴ったが dismiss されなかった」ケースに相当し、
  // morningPass: false → grade は fair 以下になる。
  // WakeRecord の明示的な 'missed' 記録は作成しない（推論で十分なため）。
  const record = records.find((r) => r.date === dateStr);
  const sleepBedtime = await fetchSleepBedtime(dateStr, yesterdayStr, healthKitEnabled, date);
  const gradeRecord = buildGradeRecord(dateStr, record, bedtimeTarget, sleepBedtime);
  await addGrade(gradeRecord);
}
```

既存の `buildGradeRecord` (grade-finalizer.ts:36) は既に `record === undefined` → `morningPass: false` として処理しているため、コード変更は不要。コメントの明確化のみ。

**Step 2: grade-finalizer.ts のコメント明確化**

`src/services/grade-finalizer.ts` L35-36:

```typescript
// 朝の判定: WakeRecord があれば result から合否判定。
// WakeRecord がない = アラームを dismiss しなかった（missed）→ 不合格。
const morningPass = record !== undefined ? isMorningPass(record.result) : false;
```

**Step 3: 既存テスト確認**

Run: `pnpm test -- --testPathPattern=grade-finalizer`
Expected: 全テスト PASS

**Step 4: コミット**

```bash
jj commit -m "docs(H3): WakeRecord なし = missed の意図を明示化"
```

---

## Task 9: ドキュメント更新 (L1, H2, L5)

**Files:**
- Modify: `docs/user-flows.md`

**Step 1: L1 — 関数名修正**

L31: `handleSnoozeRefire()` → `handleSnoozeArrival()`

**Step 2: H2 — HealthKit 取得の記述修正**

フロー3の L52:

Before:
```
│    └─ HealthKit から睡眠データを取得・記録
```

After:
```
│    └─ （HealthKit 睡眠データはダッシュボード表示時に useDailySummary が自動同期）
```

**Step 3: L5 — completion effect の順序を実装に合わせる**

フロー5 (L99-107) のコメントを実装に合わせて更新:

```
最後の TODO にチェック → areAllCompleted() === true
  └─ completion effect が発火 (index.tsx)
       ├─ 1. cancelAllAlarms() — ネイティブ側の全アラームをキャンセル
       │    └─ scheduleWakeTargetAlarm() で通常アラームを再スケジュール
       ├─ 2. endLiveActivity(liveActivityId) — ロック画面ウィジェットを終了 (fire-and-forget)
       ├─ 3. updateRecord() — 完了時刻・所要時間を WakeRecord に保存
       └─ 4. .then(() => clearSession()) — セッション + snooze/activity ID をクリア
```

**Step 4: コミット**

```bash
jj commit -m "docs: user-flows.md を実装に合わせて更新 — 関数名・HealthKit・completion effect 順序"
```

---

## Task 10: 全体テスト・lint・型チェック

**Step 1: テスト**

Run: `pnpm test`
Expected: 全テスト PASS

**Step 2: lint**

Run: `pnpm lint`
Expected: エラーなし

**Step 3: 型チェック**

Run: `pnpm typecheck`
Expected: エラーなし

**Step 4: コミット（必要なら修正）**

lint/typecheck で問題が見つかった場合は修正してコミット:

```bash
jj commit -m "chore: lint/typecheck 修正"
```
