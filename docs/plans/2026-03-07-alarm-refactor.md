# Alarm & Snooze リファクタリング実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** alarm-kit.ts を責務ごとに分割し、アラームキャンセル戦略を統一し、オーケストレーション責務を session-lifecycle に集約する。

**Architecture:** alarm-kit.ts（422行、5つの関心事が混在）を alarm-scheduler.ts / live-activity.ts に分割。wakeup.tsx に漏れ出ていたアラームキャンセル前処理を startMorningSession に統合し、呼び出し元が内部手順を知らなくて済むようにする。

**Tech Stack:** TypeScript, expo-alarm-kit, Zustand, Jest

---

## 現状のファイル構成と問題

```
src/services/alarm-kit.ts (422行) ← 5責務が混在
  - アラームスケジュール/キャンセル
  - Live Activity 管理
  - ウィジェット同期
  - ネイティブ dismiss イベント
  - AlarmKit 初期化/ペイロード

src/services/alarm-sync.ts ← OK（変更最小限）
src/services/session-lifecycle.ts ← 前処理が wakeup.tsx に漏れている
app/wakeup.tsx ← cancelAllAlarms + setAlarmIds をオーケストレーション
```

## 変更後のファイル構成

```
src/services/alarm-kit.ts ← 薄いファサード（初期化・ペイロード・dismiss イベント・ウィジェット）
src/services/alarm-scheduler.ts ← NEW: スケジュール/キャンセル操作
src/services/live-activity.ts ← NEW: Live Activity 管理
src/services/alarm-sync.ts ← import パス変更のみ
src/services/session-lifecycle.ts ← 前処理を startMorningSession に統合
app/wakeup.tsx ← cancelAllAlarms/setAlarmIds を削除、startMorningSession のみ呼ぶ
```

---

### Task 1: alarm-scheduler.ts を作成（スケジュール/キャンセル操作の抽出）

alarm-kit.ts からアラームスケジュール・キャンセル関連の関数と定数を新ファイルに移動する。

**Files:**
- Create: `src/services/alarm-scheduler.ts`
- Modify: `src/services/alarm-kit.ts` — 移動した関数・定数を削除し、re-export しない
- Test: `src/__tests__/alarm-kit.test.ts` — import パスを変更

**Step 1: alarm-scheduler.ts を作成**

alarm-kit.ts から以下を移動:
- `getAlarmKit()` — private helper だが scheduler が必要とするため移動。alarm-kit.ts 側にも同じものが必要なので、共通化のため `alarm-kit-core.ts` として切り出すか検討。→ 実際には `getAlarmKit` は alarm-kit.ts の lazy-load パターンでモジュールスコープの変数を使っているため、alarm-kit.ts に残して alarm-scheduler.ts から import する形にする。ただし現状 export されていないので export に変更する。
- `toIOSWeekday()` — private helper
- `resolveTimeForDay()` — private helper
- `groupDaysByTime()` — private helper
- `scheduleWakeTargetAlarm()`
- `SNOOZE_DURATION_SECONDS`
- `SNOOZE_MAX_COUNT`
- `scheduleSnoozeAlarms()`
- `cancelAllAlarms()`
- `cancelAlarmsByIds()`

```typescript
// src/services/alarm-scheduler.ts
// alarm-kit.ts から移動するコード。getAlarmKit は alarm-kit.ts から import。
// 中身は既存コードと同一。import パスだけ変更。
```

**Step 2: alarm-kit.ts から移動した関数を削除**

alarm-kit.ts に残るもの:
- `getAlarmKit()` — export に変更（alarm-scheduler.ts, live-activity.ts が使う）
- `isAlarmKitAvailable()`
- `APP_GROUP_ID`
- `LaunchPayload` type
- `initializeAlarmKit()`
- `checkLaunchPayload()`
- `NativeDismissEvent` type
- `getDismissEvents()`
- `clearDismissEvents()`
- `syncWidgetData()`
- `reloadWidgetTimelines()`
- `logError`, `logWarn` — export に変更

**Step 3: テストの import パスを更新**

`src/__tests__/alarm-kit.test.ts` のスケジューラ関連テストの import を `../services/alarm-scheduler` に変更。

**Step 4: テスト実行**

Run: `pnpm test -- --testPathPattern="alarm-kit" --no-coverage`
Expected: ALL PASS

**Step 5: 他の消費者の import パスを更新**

以下のファイルが alarm-kit.ts からスケジューラ関数を import している:
- `src/services/alarm-sync.ts` — `cancelAlarmsByIds`, `cancelAllAlarms`, `scheduleWakeTargetAlarm`
- `src/services/session-lifecycle.ts` — `cancelAlarmsByIds`, `SNOOZE_DURATION_SECONDS`, `scheduleSnoozeAlarms`
- `app/wakeup.tsx` — `cancelAllAlarms`
- `src/__tests__/alarm-sync.test.ts` — mock パス
- `src/__tests__/session-lifecycle.test.ts` — mock パス

**Step 6: 全テスト実行**

Run: `pnpm test --no-coverage`
Expected: ALL PASS

**Step 7: lint 修正**

Run: `pnpm lint:fix`

**Step 8: コミット**

```bash
jj commit -m "refactor: alarm-kit.ts からスケジュール/キャンセル操作を alarm-scheduler.ts に分離"
```

---

### Task 2: live-activity.ts を作成（Live Activity 管理の抽出）

**Files:**
- Create: `src/services/live-activity.ts`
- Modify: `src/services/alarm-kit.ts` — LA 関数を削除
- Modify: `src/services/session-lifecycle.ts` — import パス変更
- Modify: `app/(tabs)/index.tsx` — import パス変更
- Test: `src/__tests__/alarm-kit.test.ts` — LA テストの import 変更

**Step 1: live-activity.ts を作成**

alarm-kit.ts から以下を移動:
- `LiveActivityTodo` interface
- `startLiveActivity()`
- `updateLiveActivity()`
- `endLiveActivity()`

これらは全て `getAlarmKit()` と `logError` を使うので alarm-kit.ts から import。

**Step 2: alarm-kit.ts から LA 関数を削除**

**Step 3: 消費者の import パスを更新**

- `src/services/session-lifecycle.ts` — `startLiveActivity`, `updateLiveActivity`, `endLiveActivity` を `./live-activity` から import
- `app/(tabs)/index.tsx` — `updateLiveActivity` を `../src/services/live-activity` から import
- `src/__tests__/alarm-kit.test.ts` — LA テストの import を `../services/live-activity` に変更
- `src/__tests__/session-lifecycle.test.ts` — mock に `../services/live-activity` を追加

**Step 4: テスト実行**

Run: `pnpm test --no-coverage`
Expected: ALL PASS

**Step 5: lint 修正 + コミット**

```bash
pnpm lint:fix
jj commit -m "refactor: Live Activity 管理を live-activity.ts に分離"
```

---

### Task 3: startMorningSession に前処理を統合

wakeup.tsx の handleDismiss から `cancelAllAlarms()` + `setAlarmIds([])` を session-lifecycle.ts の `startMorningSession` に移動する。

**背景:** 現在 wakeup.tsx が「既存アラームキャンセル → セッション開始」という手順を知っている。これは session-lifecycle の責務であり、呼び出し元は `startMorningSession` だけ呼べば済むべき。

**Files:**
- Modify: `src/services/session-lifecycle.ts` — `startMorningSession` の先頭でアラームキャンセルを実行
- Modify: `app/wakeup.tsx` — cancelAllAlarms 呼び出しと関連 import を削除
- Modify: `src/__tests__/session-lifecycle.test.ts` — テスト追加

**Step 1: session-lifecycle.ts の startMorningSession を変更**

`startMorningSession` の先頭に以下を追加:
```typescript
// セッション開始前に既存の wake-target アラームをキャンセルする。
// スヌーズアラームスケジュール後に cancelAllAlarms が走る競合を防ぐ。
// alarmIds は呼び出し元で取得して渡す必要がないよう、ストアから直接読む。
const targetState = useWakeTargetStore.getState();
if (targetState.alarmIds.length > 0) {
  await cancelAlarmsByIds(targetState.alarmIds);
  await targetState.setAlarmIds([]);
}
```

注意: `cancelAllAlarms` ではなく `cancelAlarmsByIds(alarmIds)` を使う。これにより:
- wake-target アラームのみキャンセル（他のアラームがあっても安全）
- `scheduleWakeTargetAlarm` 内部の `cancelAllAlarms` と戦略が統一される

**Step 2: wakeup.tsx の handleDismiss を簡素化**

削除するコード:
```typescript
// 以下を削除:
if (alarmIds.length > 0) {
  await cancelAllAlarms();
  await setAlarmIds([]);
}
```

不要になる import と state:
- `cancelAllAlarms` の import
- `alarmIds` の useWakeTargetStore subscribe
- `setAlarmIds` の useWakeTargetStore subscribe
- `useCallback` の deps から `alarmIds`, `setAlarmIds` を削除

**Step 3: テスト追加**

`src/__tests__/session-lifecycle.test.ts` に追加:
```typescript
test('cancels existing wake-target alarms before scheduling snooze', async () => {
  useWakeTargetStore.setState({
    target: createTargetWithTodos(),
    loaded: true,
    alarmIds: ['wake-alarm-1', 'wake-alarm-2'],
  });
  const params = createStartParams();

  await startMorningSession(params);

  // 既存の wake-target アラームがキャンセルされること
  expect(cancelAlarmsByIds).toHaveBeenCalledWith(['wake-alarm-1', 'wake-alarm-2']);
  // alarmIds がクリアされること
  expect(useWakeTargetStore.getState().alarmIds).toEqual([]);
  // その後スヌーズがスケジュールされること
  expect(scheduleSnoozeAlarms).toHaveBeenCalled();
});
```

**Step 4: テスト実行**

Run: `pnpm test --no-coverage`
Expected: ALL PASS

**Step 5: lint 修正 + コミット**

```bash
pnpm lint:fix
jj commit -m "refactor: アラームキャンセル前処理を startMorningSession に統合し wakeup.tsx を簡素化"
```

---

### Task 4: typecheck + 全テスト + lint の最終検証

**Step 1: 型チェック**

Run: `pnpm typecheck`
Expected: エラーなし

**Step 2: 全テスト**

Run: `pnpm test --no-coverage`
Expected: ALL PASS

**Step 3: lint チェック**

Run: `pnpm lint`
Expected: エラーなし

**Step 4: コミット（必要な場合のみ）**

修正があれば:
```bash
pnpm lint:fix
jj commit -m "chore: リファクタリング後の lint/type 修正"
```

---

## 実装順序の理由

1. **Task 1 (alarm-scheduler.ts)** — 最も多くのファイルに影響するため先に。他のタスクはこの分割を前提とする。
2. **Task 2 (live-activity.ts)** — Task 1 と独立だが、Task 3 の mock 変更を減らすため先に。
3. **Task 3 (前処理統合)** — Task 1-2 で分割済みの import を使うため最後。これが設計上最も重要な変更。
4. **Task 4 (最終検証)** — 全体の整合性確認。

## リスクと注意点

- **jest.mock パス**: alarm-kit.ts を分割すると、テストの `jest.mock(...)` パスも全て更新が必要。漏れるとテストが壊れるが、実行すれば即座に検出できる。
- **循環 import**: `alarm-scheduler.ts` → `alarm-kit.ts`（getAlarmKit）と `session-lifecycle.ts` → `alarm-scheduler.ts` の方向に注意。循環しない設計になっている。
- **expo-alarm-kit mock**: `__mocks__/expo-alarm-kit.ts` がある場合は確認（Jest の auto-mock が効いている前提）。
