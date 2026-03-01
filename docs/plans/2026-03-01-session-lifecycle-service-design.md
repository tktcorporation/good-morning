# Session Lifecycle Service — セッション管理のリファクタリング

## Context

セッションのライフサイクル操作が **wakeup.tsx（開始）** → **index.tsx（完了）** → **_layout.tsx（復元・クリーンアップ）** の3ファイルに散在している。各ファイルが alarm-kit.ts, morning-session-store, snooze.ts を独自に呼び出し、3段ネストの fire-and-forget `.then()` チェーンでオーケストレーションしている。

### 現状の問題

1. **オーケストレーション散在**: 「セッション開始時に何が起きるか」を理解するには3ファイルを横断して読む必要がある
2. **fire-and-forget チェーン**: `wakeup.tsx:133-168` で record → session → snooze → liveActivity が入れ子の `.then()` で実行され、途中失敗で後続が暗黙にスキップされる
3. **メモリのみ状態**: `snoozeAlarmIds` がアプリ kill で消失し、ID ベースのキャンセルが不可能になる（`cancelAllAlarms()` に頼る設計の原因）
4. **暗黙のステートマシン**: セッション遷移（IDLE → ACTIVE → COMPLETING → IDLE）が明示されておらず、不正な遷移を防ぐガードがない
5. **コンポーネント肥大化**: wakeup.tsx の dismiss ハンドラと index.tsx の completion effect がビジネスロジックを直接持ち、テストが困難

---

## 設計方針: Session Lifecycle Service

### 基本方針

セッションのオーケストレーション（複数サービスの協調）を1つのサービスモジュール `src/services/session-lifecycle.ts` に集約する。

```
┌─────────────────────────────────────────────────────┐
│              session-lifecycle.ts                     │
│                                                       │
│  startMorningSession()                               │
│    → store.startSession + scheduleSnooze + startLA   │
│                                                       │
│  completeMorningSession()                            │
│    → cancelAlarms + endLA + updateRecord + clear     │
│                                                       │
│  handleSnoozeArrival()                               │
│    → update countdown + update LA                    │
│                                                       │
│  restoreSessionOnLaunch()                            │
│    → restore countdown + cleanup stale               │
│                                                       │
└──────────┬───────────┬──────────────┬────────────────┘
           │           │              │
    alarm-kit.ts  session-store  wake-record-store
    (スケジュール)  (状態保持)      (レコード保持)
```

**コンポーネントは薄いレイヤーになる:**
- `wakeup.tsx`: `startMorningSession(params)` を呼ぶだけ
- `index.tsx`: `completeMorningSession(session)` を呼ぶだけ
- `_layout.tsx`: `restoreSessionOnLaunch()` と `handleSnoozeArrival()` を呼ぶだけ

### ストアの役割変更

`morning-session-store.ts` は**純粋なデータホルダー**に徹する:
- get / set / persist のみ
- ビジネスロジック（「全TODO完了したらアラームキャンセル」等）は持たない
- `snoozeAlarmIds`, `snoozeFiresAt` は引き続きメモリのみ（導出可能な値のため）

---

## 新規ファイル: `src/services/session-lifecycle.ts`

### 関数一覧

#### `startMorningSession(params)`

wakeup.tsx の dismiss 後に呼ばれる。セッション開始に必要な全操作を逐次実行する。

```typescript
interface StartSessionParams {
  readonly target: WakeTarget;
  readonly resolvedTime: AlarmTime;
  readonly dismissTime: Date;
  readonly mountedAt: Date;
  readonly dayBoundaryHour: number;
}

export async function startMorningSession(params: StartSessionParams): Promise<void> {
  const { target, resolvedTime, dismissTime, mountedAt, dayBoundaryHour } = params;
  const hasTodos = target.todos.length > 0;
  const dateStr = getLogicalDateString(dismissTime, dayBoundaryHour);
  const diffMinutes = calculateDiffMinutes(resolvedTime, dismissTime);
  const result = calculateWakeResult(diffMinutes);

  // 1. WakeRecord 作成（失敗時は throw — レコードなしで続行は不整合）
  const record = await addRecord({ ... });

  // TODO がなければセッション不要 — ここで終了
  if (!hasTodos) return;

  // 2. セッション作成 + AsyncStorage 永続化
  const sessionTodos = target.todos.map(todo => ({ ... }));
  await store.startSession(record.id, dateStr, sessionTodos);

  // 3. スヌーズ先行スケジュール（失敗してもセッション自体は有効）
  try {
    const snoozeIds = await scheduleSnoozeAlarms(dismissTime);
    const snoozeFiresAt = new Date(
      dismissTime.getTime() + SNOOZE_DURATION_SECONDS * 1000
    ).toISOString();
    store.setSnoozeAlarmIds(snoozeIds);
    store.setSnoozeFiresAt(snoozeFiresAt);
  } catch {
    // スヌーズ失敗はログのみ — セッションは続行
  }

  // 4. Live Activity 開始（失敗してもセッション自体は有効）
  try {
    const activityId = await startLiveActivity(liveActivityTodos, snoozeFiresAt);
    if (activityId !== null) {
      await store.setLiveActivityId(activityId);
    }
  } catch {
    // Live Activity 失敗はログのみ — セッションは続行
  }
}
```

**エラー境界の考え方:**
- Step 1（レコード作成）失敗 → throw（呼び出し元がエラー表示）
- Step 2（セッション作成）失敗 → throw（レコードは残るがセッションなしで矛盾）
- Step 3, 4（スヌーズ・LA）失敗 → catch してログ、セッションは続行

#### `completeMorningSession(session)`

index.tsx の completion effect から呼ばれる。TODO 全完了後のクリーンアップを一括実行。

```typescript
export async function completeMorningSession(
  session: MorningSession,
  updateRecord: WakeRecordStore['updateRecord'],
): Promise<void> {
  const now = new Date();

  // 1. 全アラームキャンセル（スヌーズ含む）
  await cancelAllAlarms();

  // 2. Live Activity 終了（clearSession で liveActivityId が消える前に）
  if (session.liveActivityId !== null) {
    await endLiveActivity(session.liveActivityId);
  }

  // 3. WakeRecord 更新
  const todoCompletionSeconds = Math.round(
    (now.getTime() - new Date(session.startedAt).getTime()) / 1000
  );
  const todoRecords = session.todos.map((todo, index) => ({ ... }));

  try {
    await updateRecord(session.recordId, {
      todosCompleted: true,
      todosCompletedAt: now.toISOString(),
      todoCompletionSeconds,
      todos: todoRecords,
    });
  } catch {
    // レコード更新失敗してもセッションはクリアする（無限再発火防止）
  }

  // 4. セッションクリア
  await store.clearSession();

  // 5. 通常アラーム再スケジュール
  const currentTarget = useWakeTargetStore.getState().target;
  if (currentTarget?.enabled) {
    const newIds = await scheduleWakeTargetAlarm(currentTarget);
    useWakeTargetStore.getState().setAlarmIds(newIds);
  }
}
```

#### `handleSnoozeArrival()`

現在 `snooze.ts` にある同名関数を移動。ロジックは変更なし。

```typescript
export function handleSnoozeArrival(): boolean {
  // セッション有効 & TODO未完了 → snoozeFiresAt 更新 + LA 更新
  // それ以外 → false
}
```

#### `restoreSessionOnLaunch(dayBoundaryHour)`

_layout.tsx の初期化で呼ばれる。通常起動時（アラーム経由でない）のセッション復元。

```typescript
export function restoreSessionOnLaunch(dayBoundaryHour: number): void {
  const state = store.getState();

  // 1. 期限切れセッションのクリーンアップ
  if (state.session !== null) {
    const today = getLogicalDateString(new Date(), dayBoundaryHour);
    if (state.session.date !== today) {
      if (state.session.liveActivityId !== null) {
        endLiveActivity(state.session.liveActivityId);
      }
      state.clearSession();
      return;
    }
  }

  // 2. アクティブセッションのスヌーズカウントダウン復元
  if (state.session !== null && !state.areAllCompleted()) {
    restoreSnoozeCountdown(state.session.startedAt);
  }

  // 3. TODO全完了済みだが LA が残っている場合のクリーンアップ
  if (
    state.session !== null &&
    state.areAllCompleted() &&
    state.session.liveActivityId !== null
  ) {
    endLiveActivity(state.session.liveActivityId);
  }
}
```

---

## 既存ファイルの変更

### `app/wakeup.tsx`

handleDismiss を大幅簡素化:

```typescript
// Before: 35行のネストした .then() チェーン
// After:
const handleDismiss = useCallback(() => {
  if (dismissing) return;
  setDismissing(true);
  stopAlarmSound();
  Vibration.cancel();

  if (alarmIds.length > 0) {
    cancelAllAlarms().then(() => setAlarmIds([]));
  }

  if (isDemo) { router.back(); return; }

  if (target !== null && resolvedTime !== null) {
    startMorningSession({
      target,
      resolvedTime,
      dismissTime: new Date(),
      mountedAt: mountedAt.current,
      dayBoundaryHour,
    }).catch((e) => {
      console.error('[WakeUp] Failed to start session:', e);
      Alert.alert(t('error.title'), t('error.recordSaveFailed'));
    });
  }

  void clearNextOverride();
  router.replace('/');
}, [/* deps */]);
```

**削除されるインポート:** `scheduleSnoozeAlarms`, `startLiveActivity`, `SNOOZE_DURATION_SECONDS`, `SessionTodo`, `WakeTodoRecord`, `calculateDiffMinutes`, `calculateWakeResult`, `getLogicalDateString`

### `app/(tabs)/index.tsx`

completion effect を簡素化:

```typescript
// Before: 40行の effect + 複数の fire-and-forget
// After:
useEffect(() => {
  if (session === null || !areAllCompleted()) return;
  completeMorningSession(session, updateRecord).catch(() => {});
}, [session, areAllCompleted, updateRecord]);
```

**削除されるインポート:** `cancelAllAlarms`, `endLiveActivity`, `scheduleWakeTargetAlarm`

### `app/_layout.tsx`

初期化 effect を簡素化:

```typescript
// Before: cleanupStaleSession 関数 + 複雑な分岐
// After:
coreLoaded.then(() => {
  if (payload === null) {
    // 通常起動
    restoreSessionOnLaunch(useSettingsStore.getState().dayBoundaryHour);
  }
});

// スヌーズ到着
if (isSnoozePayload(payload)) {
  sessionLoaded.then(() => {
    handleSnoozeArrival();
    router.push('/');
  });
} else if (payload !== null) {
  // 初回アラーム
  coreLoaded.then(() => {
    restoreSessionOnLaunch(useSettingsStore.getState().dayBoundaryHour);
  });
  router.push('/wakeup');
}
```

**削除:** `cleanupStaleSession` 関数（ロジックは `restoreSessionOnLaunch` に統合）

**削除されるインポート:** `cancelAllAlarms`, `endLiveActivity`, `scheduleWakeTargetAlarm` を `restoreSnoozeCountdown` から `restoreSessionOnLaunch` に置換

### `src/services/snooze.ts`

**削除。** `handleSnoozeArrival` と `restoreSnoozeCountdown` は `session-lifecycle.ts` に移動。

### `src/stores/morning-session-store.ts`

変更なし。引き続きデータホルダーとして機能する。インターフェースも変更なし。

---

## テスト

### 新規: `src/__tests__/session-lifecycle.test.ts`

alarm-kit.ts と各ストアをモックし、ライフサイクル関数の統合テスト:

- `startMorningSession`:
  - TODO ありの場合: record → session → snooze → LA の順で呼ばれること
  - TODO なしの場合: record のみ作成されること
  - スヌーズ失敗時: session は作成されること
  - LA 失敗時: session + snooze は有効なこと
  - record 作成失敗時: throw すること
- `completeMorningSession`:
  - cancelAllAlarms → endLA → updateRecord → clearSession → reschedule の順
  - updateRecord 失敗時: clearSession は実行されること
- `handleSnoozeArrival`:
  - 既存の snooze.test.ts のテストを移植
- `restoreSessionOnLaunch`:
  - 期限切れセッション → クリア + LA 終了
  - アクティブセッション → countdown 復元
  - 全完了 + LA 残存 → LA 終了

### 削除: `src/__tests__/snooze.test.ts`

テストは `session-lifecycle.test.ts` に移動。

---

## 変更しないもの

- `src/services/alarm-kit.ts`: スケジュール方式は変更なし
- `src/stores/morning-session-store.ts`: インターフェース変更なし
- `src/types/morning-session.ts`: 型定義変更なし
- `snoozeAlarmIds` / `snoozeFiresAt` のメモリのみ設計: 変更なし（導出可能なため永続化不要）

---

## 検証

1. `pnpm typecheck` — 型チェック通過
2. `pnpm test` — 全テスト通過
3. `pnpm lint` — エラーなし
4. 手動確認:
   - アラーム dismiss → セッション開始 → スヌーズ発火（アプリ kill 状態でも）
   - TODO 全完了 → スヌーズキャンセル → 通常アラーム再スケジュール
   - アプリ通常起動 → 期限切れセッションクリーンアップ
   - スヌーズ経由起動 → カウントダウン更新

---

## まとめ

| Before | After |
|--------|-------|
| 3ファイルに散在するオーケストレーション | `session-lifecycle.ts` に集約 |
| 3段ネストの `.then()` チェーン | 逐次 `await` で明示的エラー境界 |
| コンポーネント内のビジネスロジック | サービス呼び出し1行 |
| 暗黙のステートマシン | 関数名が遷移を表現 |
| snooze.ts + _layout.tsx に分散する復元ロジック | `restoreSessionOnLaunch` に統合 |
