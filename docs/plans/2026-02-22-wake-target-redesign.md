# Wake Target Redesign + Onboarding

Date: 2026-02-22

## Overview

アラームモデルを「複数アラームのリスト管理」から「単一の起床ターゲット」に再設計する。
併せてセットアップウィザード（チュートリアル＋デモ体験）を追加し、
ホーム画面をDuolingo風のモチベーション重視ダッシュボードに刷新する。

**コアコンセプト**: Todoの調整を通じたPDCAサイクルがユーザー体験の本筋。
過去の振り返りとTodo改善をホーム画面で直接行える設計にする。

## 1. Data Model

### WakeTarget (singleton)

```typescript
interface WakeTarget {
  defaultTime: AlarmTime;
  dayOverrides: Partial<Record<DayOfWeek, DayOverride>>;
  nextOverride: NextOverride | null;
  todos: TodoItem[];
  enabled: boolean;
}

type DayOverride =
  | { type: 'custom'; time: AlarmTime }
  | { type: 'off' };

interface NextOverride {
  time: AlarmTime;
}
```

- `nextOverride` はアラーム鳴動後に自動で `null` に戻る
- `dayOverrides` は例外のある曜日だけエントリが存在
- 「明日の時刻」解決ロジック: nextOverride > dayOverrides > defaultTime

### WakeRecord (既存を流用)

既存の `WakeRecord` をほぼそのまま使用。`alarmId` フィールドは不要になるが、
後方互換のため残すか空文字にする。

既存の `todos: WakeTodoRecord[]` が日別Todo振り返りに活用できる。

### Storage

- AsyncStorage key: `'wake-target'` (新規)
- 旧 `'good-morning-alarms'` からのマイグレーション対応

## 2. Setup Wizard + Demo

単一ページ (`onboarding.tsx`) 内でステップをステート管理。

### Steps

1. **Welcome** - アプリの概念を説明
2. **Time** - デフォルト起床時刻の設定（ピッカー、デフォルト 7:00）
3. **Todos** - 朝タスクの追加（プリセット候補: 水を飲む、ストレッチ、顔を洗う）
4. **Permission** - 通知許可リクエスト
5. **Demo** - 「試しにアラーム鳴らしてみますね」
   - 実際のアラーム音を短く鳴らす（3秒程度）
   - Todoチェック→解除の操作を体験
   - WakeRecord には記録しない（デモフラグで判別）
   - 起床フロー画面を `demo=true` パラメータで再利用

### 初回判定

- `AsyncStorage` に `'onboarding-completed'` フラグ
- フラグなし → onboarding へリダイレクト
- フラグあり → ホームへ

## 3. Home Dashboard

Duolingo風のモチベーション重視ダッシュボード。

### 構成要素

1. **明日のターゲット** - 時刻を大きく表示、タップで時刻変更モーダル
2. **Todoリスト（インライン編集可能）**
   - 追加・削除・並び替え をホームで直接操作
   - PDCAの起点: 過去の振り返りを見てTodoを調整する
3. **週間カレンダー** - 今週の成功/失敗を色で表示
   - 各日タップ → 日別振り返りモーダル
4. **ストリーク** - 連続成功日数（デュオリンゴ風）
5. **成功率** - 今週の成績サマリー

### 日別振り返りモーダル (day-review)

カレンダーの各日をタップすると表示:
- ターゲット時刻 vs 実際の時刻
- 結果 (great/ok/late/missed)
- その日のTodo達成状況（✅/☐）
- 何番目のTodoで止まったかが分かる

### 時刻変更モーダル (target-edit)

ホームの時刻タップで表示:
- 時刻ピッカー
- 「明日だけ変更」or「デフォルト変更」の選択
- 1画面で完結

## 4. Routing

```
RootLayout (_layout.tsx)
├── onboarding.tsx           # 単一ページ、内部でステップ管理
├── (tabs)/
│   ├── _layout.tsx          # 2タブ: ホーム + 設定
│   ├── index.tsx            # ダッシュボード (Todo編集含む)
│   └── settings.tsx         # 設定メニュー
├── target-edit.tsx          # 時刻変更モーダル
├── schedule.tsx             # 曜日ルール編集 (設定から遷移)
├── day-review.tsx           # 日別振り返りモーダル
└── wakeup.tsx               # 起床フロー (フルスクリーンモーダル)
                             # ?demo=true でデモモード
```

### 削除対象

- `app/alarm/create.tsx`
- `app/alarm/[id].tsx`
- `app/(tabs)/stats.tsx`
- `app/wakeup/[id].tsx`

## 5. Settings

設定画面は「まれにしか使わない操作」を集約:
- 曜日ルール編集（schedule画面へ遷移）
- アラーム ON/OFF トグル
- 通知許可状態の確認
- アプリ情報

※ デフォルト時刻変更は target-edit モーダルから
※ Todo編集はホームで直接行う

## 6. Wake Flow Changes

- `wakeup/[id].tsx` → `wakeup.tsx`（IDパラメータ不要、シングルトン）
- デモモード対応（`?demo=true`）
- Todo チェック→解除ロジックは既存を流用
- 鳴動後に `nextOverride` を自動クリア
- 完了時に WakeRecord 記録（デモ時は記録しない）

## 7. Tab Structure

2タブ構成: ホーム + 設定
- 統計タブは廃止（ホームダッシュボードに統合）
