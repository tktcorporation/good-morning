# 起床フロー分離 + 週間カレンダー改善

## Context

### 問題1: 起床フローが不便
現在はアラーム画面でTODO全完了しないとアラームを止められない。
ユーザーが望むフロー: アラームはすぐ止められる → TODOはホーム画面でゆっくり完了 → 全完了で「起きた」と判定。

### 問題2: 週間カレンダーが未来寄り
`getWeekDates()` が月曜〜日曜の固定週を返すため、月曜日だと過去の履歴が見えない。
ユーザーは「今日 + 過去6日」を常に表示したい。

---

## 変更1: 起床フローの分離

### 新しいフロー
```
アラーム鳴る → wakeup画面でDismiss → WakeRecord作成(pending)
  → ホーム画面に戻る → タブバーにTODO進捗バナー表示
  → TODO完了していく → 全完了でWakeRecord確定 → バナー消える
```

### Step 1: MorningSession 型定義

**新規: `src/types/morning-session.ts`**

```typescript
export interface SessionTodo {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
  readonly completedAt: string | null;
}

export interface MorningSession {
  readonly recordId: string;    // 対応するWakeRecordのID
  readonly date: string;        // YYYY-MM-DD
  readonly startedAt: string;   // ISO datetime (アラームdismiss時刻)
  readonly todos: readonly SessionTodo[];
}
```

### Step 2: morning-session-store 作成

**新規: `src/stores/morning-session-store.ts`**

AsyncStorage key: `'morning-session'`

```typescript
interface MorningSessionState {
  readonly session: MorningSession | null;
  readonly loaded: boolean;
  loadSession: () => Promise<void>;
  startSession: (recordId: string, date: string, todos: readonly SessionTodo[]) => Promise<void>;
  toggleTodo: (todoId: string) => Promise<void>;
  clearSession: () => Promise<void>;
  isActive: () => boolean;
  areAllCompleted: () => boolean;
  getProgress: () => { completed: number; total: number };
}
```

- `startSession`: Dismiss時に呼ばれる。セッション情報をメモリ+AsyncStorageに保存
- `toggleTodo`: TODO完了トグル（完了→未完了も可）。変更のたびにpersist
- `clearSession`: 全完了時 or 新アラーム発火時にクリア
- `loadSession`: アプリ起動時にAsyncStorageから復元

### Step 3: WakeRecord 型に `todosCompleted` 追加

**変更: `src/types/wake-record.ts`**

```typescript
export interface WakeRecord {
  // ...既存フィールド
  readonly todosCompleted: boolean; // false=TODO進行中, true=全完了
}
```

新規フィールド:
- `todosCompleted: boolean` — TODO全完了したか
- `todosCompletedAt: string | null` — 全TODO完了時刻 (ISO datetime)

既存の `dismissedAt` がアラームを止めた時刻、`todosCompletedAt` が全TODO完了時刻となり、
差分で「起きてからルーティン完了までの所要時間」が分かる。

各TODOの完了時刻は `WakeTodoRecord.completedAt` に既にある（ISO datetime）。
セッション中に記録した `SessionTodo.completedAt` をWakeRecord確定時にマッピングする。

後方互換: 既存レコードは `todosCompleted ?? true`, `todosCompletedAt ?? null` として扱う。

**変更: `src/stores/wake-record-store.ts`**

`updateRecord` の受け入れフィールドを拡張:
```typescript
data: Partial<Pick<WakeRecord,
  'healthKitWakeTime' | 'diffMinutes' | 'result' |
  'todos' | 'todoCompletionSeconds' | 'todosCompleted' | 'todosCompletedAt'
>>
```

### Step 4: wakeup画面の簡素化

**変更: `app/wakeup.tsx`**

削除するもの:
- TODOリスト表示（ScrollView + TodoListItem）
- プログレスバー
- `allCompleted` によるDismissボタンの無効化制御
- `handleToggleTodo`, `lastTodoCompletedAt` ref

残すもの:
- 現在時刻表示
- アラーム時刻表示
- アラームサウンド + バイブレーション

追加するもの:
- 常に有効な「アラームを止める」ボタン

`handleDismiss` の変更:
1. サウンド/バイブ停止
2. WakeRecord作成（`todosCompleted: false`, TODO未完了状態）
3. TODOがある場合 → `morningSessionStore.startSession(...)` でセッション開始
4. TODOが0件の場合 → `todosCompleted: true` で即確定、セッション不要
5. `clearNextOverride()` → `router.replace('/')`

### Step 5: タブバーにバナー表示

**新規: `src/components/MorningRoutineBanner.tsx`**

セッションがアクティブな時にタブバーの上に表示されるバナー。
- プログレスバー + テキスト（例:「朝のルーティン: 2/3 完了」）
- タップでホーム画面にフォーカス

**変更: `app/(tabs)/_layout.tsx`**

`<Tabs>` の `tabBar` prop でカスタムタブバーを提供:
```typescript
<Tabs tabBar={(props) => <TabBarWithBanner {...props} />}>
```

`TabBarWithBanner` は:
1. セッションがアクティブ → バナー + デフォルトタブバー
2. セッションなし → デフォルトタブバーのみ

### Step 6: ホーム画面にTODO完了UI追加

**変更: `app/(tabs)/index.tsx`**

セッションがアクティブな時、既存の「朝のタスク」セクションの代わりに:
- 「今朝のルーティン」セクションを表示
- `TodoListItem` で各TODO表示（`onToggle` → `morningSessionStore.toggleTodo`）
- プログレスバー表示
- 全完了時:
  - `todosCompletedAt` = 現在時刻(ISO)
  - `todoCompletionSeconds` = `todosCompletedAt` - `session.startedAt` (秒)
  - 各TODOの `completedAt` をセッションからマッピング
  - `wakeRecordStore.updateRecord(recordId, { todosCompleted: true, todosCompletedAt, todos, todoCompletionSeconds })` でレコード確定
  - `morningSessionStore.clearSession()`

### Step 7: アプリ起動時のセッション復元

**変更: `app/_layout.tsx`**

- `loadSession()` を `loadTarget()`, `loadRecords()` と並行して呼ぶ
- アラーム発火ハンドラ: 既存セッションがあれば自動終了（未完了TODO付きで確定）→ 新セッション開始

### Step 8: 翻訳更新

**変更ファイル:**
- `src/i18n/locales/{ja,en}/wakeup.json` — TODO関連キー削除、dismiss系テキスト追加
- `src/i18n/locales/{ja,en}/dashboard.json` — morningRoutine セクションのキー追加

### Step 9: テスト

- **新規**: `src/__tests__/morning-session-store.test.ts`
  - セッション開始/TODO完了/クリア/復元/進捗計算
- **変更**: `src/__tests__/wake-record-store.test.ts`
  - `todosCompleted` フィールドの更新テスト
- **変更**: `src/__tests__/wake-record-types.test.ts`
  - テストフィクスチャに `todosCompleted` 追加

---

## 変更2: 週間カレンダーを「過去6日+今日」に変更

**変更: `app/(tabs)/index.tsx`**

`getWeekDates()` を修正:

```typescript
// Before: 月曜〜日曜の固定週
// After: 今日から6日前まで（常に過去を表示）
function getRecentDates(): readonly Date[] {
  const today = new Date();
  const dates: Date[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(d);
  }
  return dates;
}
```

これにより月曜でも直近7日分（火〜月）が見える。

`weekStats` の計算も `getWeekStats(weekStart)` の引数を新しいリストの先頭日に合わせる。

---

## ファイル変更一覧

| ファイル | 操作 | 内容 |
|---------|------|------|
| `src/types/morning-session.ts` | 新規 | MorningSession, SessionTodo 型 |
| `src/stores/morning-session-store.ts` | 新規 | セッション管理Zustandストア |
| `src/components/MorningRoutineBanner.tsx` | 新規 | タブバー上部バナー |
| `src/__tests__/morning-session-store.test.ts` | 新規 | セッションストアのテスト |
| `src/types/wake-record.ts` | 変更 | `todosCompleted` フィールド追加 |
| `src/stores/wake-record-store.ts` | 変更 | `updateRecord` 拡張 |
| `app/wakeup.tsx` | 変更 | TODO削除、dismiss-onlyに簡素化 |
| `app/(tabs)/_layout.tsx` | 変更 | カスタムタブバー + バナー |
| `app/(tabs)/index.tsx` | 変更 | セッションTODO UI追加 + 週間カレンダー改善 |
| `app/_layout.tsx` | 変更 | セッション復元 + アラームハンドラ更新 |
| `src/i18n/locales/{ja,en}/wakeup.json` | 変更 | テキスト簡素化 |
| `src/i18n/locales/{ja,en}/dashboard.json` | 変更 | morningRoutine キー追加 |
| `src/__tests__/wake-record-store.test.ts` | 変更 | テスト追加 |
| `src/__tests__/wake-record-types.test.ts` | 変更 | フィクスチャ更新 |

## 実装順序

1. 型定義（morning-session.ts, wake-record.ts）
2. ストア（morning-session-store.ts, wake-record-store.ts）
3. コンポーネント（MorningRoutineBanner.tsx）
4. 画面（wakeup.tsx → index.tsx → _layout.tsx → _layout.tsx(root)）
5. 翻訳ファイル
6. 週間カレンダー改善（index.tsx の getWeekDates → getRecentDates）
7. テスト
8. 検証: `pnpm typecheck && pnpm lint && pnpm test`
