# スヌーズ先行スケジュール方式への移行 + 重大バグ修正

## Context

現在のスヌーズ実装は、アラーム dismiss 時に JS 側で次のスヌーズをスケジュールする方式。
しかし iOS ではユーザーがロック画面からアラームを dismiss するとアプリが起動しない場合があり、
**スヌーズが動かないパターンが多い**。

expo-alarm-kit には `doSnoozeIntent`（ネイティブスヌーズボタン）と
`scheduleAlarm`（一時アラーム事前スケジュール）の両方の機能がある。
**ハイブリッド方式**: ネイティブスヌーズを有効化しつつ、大量の先行スケジュールで確実性を担保する。

さらに、並行調査で **calculateDiffMinutes の深夜跨ぎバグ**（重大）と
**loadSession の liveActivityId マイグレーション漏れ**（重大）が発見されたため併せて修正する。

---

## Step 1: スヌーズ先行スケジュール方式の実装

### 設計

```
scheduleWakeTargetAlarm(target) 実行時:
  1. メインアラーム（既存: repeating + nextOverride）
     - doSnoozeIntent: true（ネイティブ Snooze ボタン有効化）
     - launchAppOnDismiss: true（Stop で アプリ起動）
     - launchAppOnSnooze: false（Snooze でアプリ起動しない）
  2. スヌーズアラーム × 20本（T+9, T+18, ..., T+180 = 3時間分）
     - launchAppOnDismiss: true
     - dismissPayload: { isSnooze: true, snoozeIndex: N }

TODO 全完了時:
  → cancelAllSnoozes(snoozeAlarmIds) で残り全キャンセル

アプリ起動時（isSnooze=true）:
  → セッション存在 & TODO 未完了 → Live Activity 更新 → ダッシュボード
  → セッション存在 & TODO 完了 → 残りスヌーズキャンセル → クリーンアップ
  → セッションなし → 何もしない
```

### 変更ファイル

#### `src/services/alarm-kit.ts`
- `scheduleWakeTargetAlarm`: メインアラームに `doSnoozeIntent: true` を追加
- 新関数 `scheduleSnoozeAlarms(baseTime: Date, count: number): Promise<string[]>` 追加
  - T+9*i (i=1..count) の一時アラームをスケジュール
  - 各アラームに `dismissPayload: JSON.stringify({ isSnooze: true })` を設定
- 新関数 `cancelSnoozeAlarms(ids: string[]): Promise<void>` 追加
  - 配列内の全アラーム ID をキャンセル
- `scheduleSnooze()` 関数を削除（不要に）
- `cancelSnooze()` 関数を `cancelSnoozeAlarms` に置換
- 定数追加: `SNOOZE_MAX_COUNT = 20`（9分 × 20 = 3時間）

#### `src/services/snooze.ts`
- **ファイル大幅簡素化**
- `scheduleAndStoreSnooze` → 削除（先行スケジュール済みのため不要）
- `handleSnoozeRefire` → 簡素化（再スケジュール不要、Live Activity 更新のみ）
- `restoreSnoozeIfNeeded` → 削除（ネイティブが管理するため不要）
- 新関数 `handleSnoozeArrival(): void` — スヌーズ発火時の処理（Live Activity 更新のみ）

#### `src/stores/morning-session-store.ts`
- `snoozeAlarmId: string | null` → `snoozeAlarmIds: readonly string[]` に変更
- `setSnoozeAlarmId` → `setSnoozeAlarmIds` に変更
- `snoozeFiresAt` は残す（カウントダウン表示用。次のスヌーズ時刻を計算で算出）

#### `src/stores/wake-target-store.ts`
- `alarmIds` に snoozeAlarmIds も含めるか、別途管理するか → **別途管理**
  - snoozeAlarmIds は morning-session-store に置く（セッションのライフサイクルに紐づく）

#### `app/_layout.tsx`
- 初期化 effect: スヌーズ再発火時の処理を簡素化
  - `handleSnoozeRefire` → `handleSnoozeArrival` に置換
  - `restoreSnoozeIfNeeded` の呼び出しを削除
- AppState リスナー: スヌーズ復元ロジックを削除（不要に）
  - ただし Live Activity 更新（snoozeFiresAt カウントダウン）は残す
- target effect: `scheduleWakeTargetAlarm` の返り値から snoozeAlarmIds を分離して保存

#### `app/wakeup.tsx`
- `handleDismiss` からスヌーズスケジュールを削除
- snoozeAlarmIds はアラームスケジュール時に既に生成済み → セッションストアに保存
- snoozeFiresAt の計算: `new Date(alarmTriggeredAt + 9 * 60 * 1000)` で次の発火時刻を算出
- Live Activity 開始時に snoozeFiresAt を渡す

#### `app/(tabs)/index.tsx`
- TODO 全完了 effect: `cancelSnooze(snoozeId)` → `cancelSnoozeAlarms(snoozeAlarmIds)` に変更
- snoozeFiresAt の更新: 残りの snoozeAlarmIds の最初のものから計算

---

## Step 2: calculateDiffMinutes の深夜跨ぎバグ修正（重大）

### 問題
`src/types/wake-record.ts:51-55` — targetTime が 23:50, actualTime が 0:10 の場合、
`actualMinutes(10) - targetMinutes(1430) = -1420` → `great` に誤判定。
実際は 20 分遅刻で `late` が正しい。

### 修正
```typescript
export function calculateDiffMinutes(targetTime: string, actualTime: Date): number {
  const [h, m] = targetTime.split(':').map(Number);
  const targetMinutes = h * 60 + m;
  const actualMinutes = actualTime.getHours() * 60 + actualTime.getMinutes();
  let diff = actualMinutes - targetMinutes;
  // 深夜跨ぎ補正: evaluateBedtime と同じパターン
  if (diff < -720) diff += 1440;
  if (diff > 720) diff -= 1440;
  return diff;
}
```

### テスト追加
`src/__tests__/wake-record-types.test.ts` に深夜跨ぎケースを追加。

---

## Step 3: loadSession の liveActivityId マイグレーション（重大）

### 問題
`src/stores/morning-session-store.ts:41-49` — 既存の AsyncStorage データに
`liveActivityId` フィールドがないため、復元時に `undefined` になる。
`undefined !== null` が `true` と評価され、`endLiveActivity(undefined)` が呼ばれてクラッシュ。

### 修正
```typescript
loadSession: async () => {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw !== null) {
    const parsed = JSON.parse(raw) as MorningSession;
    // マイグレーション: liveActivityId が追加される前の既存データ対応
    set({ session: { ...parsed, liveActivityId: parsed.liveActivityId ?? null }, loaded: true });
  } else {
    set({ loaded: true });
  }
},
```

---

## Step 4: テスト更新

### 削除
- `src/__tests__/snooze.test.ts` の既存テスト全て（scheduleAndStoreSnooze, handleSnoozeRefire, restoreSnoozeIfNeeded）

### 新規追加
- `src/__tests__/snooze.test.ts`:
  - `handleSnoozeArrival`: Live Activity 更新のテスト
- `src/__tests__/alarm-kit.test.ts`:
  - `scheduleSnoozeAlarms`: N 本のアラームが 9 分間隔でスケジュールされること
  - `cancelSnoozeAlarms`: 全 ID がキャンセルされること
  - `scheduleWakeTargetAlarm` に `doSnoozeIntent: true` が含まれること
- `src/__tests__/wake-record-types.test.ts`:
  - `calculateDiffMinutes` の深夜跨ぎケース

### 更新
- `morning-session-store.test.ts`: snoozeAlarmId → snoozeAlarmIds の変更を反映、liveActivityId マイグレーションテスト追加

---

## Step 5: ドキュメント更新

- `docs/user-flows.md`: スヌーズフローを先行スケジュール方式に書き換え
- `docs/plans/` に本設計書を保存

---

## 検証

1. `pnpm typecheck` — 型チェック通過
2. `pnpm test` — 全テスト通過
3. `pnpm lint` — エラーなし
4. 手動確認:
   - アラーム dismiss → 9 分後にスヌーズ発火（アプリ kill 状態でも）
   - TODO 全完了 → 残りスヌーズ全キャンセル
   - 深夜 23:50 アラーム → 0:10 dismiss → `late` 判定
   - アプリアップグレード後の起動 → クラッシュしない（liveActivityId マイグレーション）
