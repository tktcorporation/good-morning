/**
 * Screen State Registry — 全画面の全UI状態の単一の真実源。
 *
 * このファイルを更新すると、以下が自動的に反映される:
 * - docs/ui-states.md（pnpm generate:ui-docs で再生成）
 * - Storybook Stories（各状態が Story として表示）
 * - スクリーンショット（pnpm capture:screenshots で再撮影）
 *
 * 新しい画面や状態を追加するときは、このファイルだけを更新すればよい。
 */
import type { UiStateCatalog } from './types';

export const UI_STATE_CATALOG: UiStateCatalog = {
  screens: [
    // ─────────────────────────────────────────────
    // 1. ダッシュボード
    // ─────────────────────────────────────────────
    {
      name: 'ダッシュボード',
      route: '/(tabs)/index',
      type: 'tab',
      sourceFile: 'app/(tabs)/index.tsx',
      description: 'メインハブ。アラーム時刻、TODO進捗、週間統計を表示する。',
      states: [
        {
          name: 'Loading',
          condition: 'loaded === false',
          screenshotFile: 'dashboard--loading.png',
          wireframe: [
            '┌─────────────────────────┐',
            '│                         │',
            '│       Loading...        │',
            '│                         │',
            '└─────────────────────────┘',
          ].join('\n'),
          uxNotes:
            'スピナーなし、テキストのみ。初回起動で数秒かかる場合にユーザーが不安に感じる可能性',
        },
        {
          name: 'Idle（TODOあり）',
          condition: 'session === null && target.todos.length > 0',
          screenshotFile: 'dashboard--idle-with-todos.png',
          wireframe: [
            '┌─────────────────────────┐',
            '│     明日, 月曜日          │',
            '│       07:00              │',
            '├─────────────────────────┤',
            '│  睡眠時間カード            │',
            '├─────────────────────────┤',
            '│  起床目標バッファ          │',
            '│  [-] 30分 [+]             │',
            '├─────────────────────────┤',
            '│  朝のタスク               │',
            '│  ● 顔を洗う     [x]      │',
            '│  [入力欄        ] [+]    │',
            '├─────────────────────────┤',
            '│  🔥 3日連続 / 週間 / 睡眠 │',
            '└─────────────────────────┘',
          ].join('\n'),
        },
        {
          name: 'Idle（TODOなし）',
          condition: 'session === null && target.todos.length === 0',
          screenshotFile: 'dashboard--idle-no-todos.png',
          wireframe: [
            '┌─────────────────────────┐',
            '│     明日, 月曜日          │',
            '│       07:00              │',
            '├─────────────────────────┤',
            '│  朝のタスク               │',
            '│  「タスクなし」           │',
            '│  [入力欄        ] [+]    │',
            '└─────────────────────────┘',
          ].join('\n'),
        },
        {
          name: 'Session Active（ゴール内）',
          condition: 'session !== null && !goalExceeded',
          screenshotFile: 'dashboard--session-active.png',
          wireframe: [
            '┌─────────────────────────┐',
            '│     明日, 月曜日          │',
            '│       07:00              │',
            '├─────────────────────────┤',
            '│  今朝のルーティン         │',
            '│  ████████░░  3/5         │',
            '│  目標まで 12:34          │',
            '│  次のスヌーズ 3:45       │',
            '│  ☐ 顔を洗う              │',
            '│  ☑ 水を飲む              │',
            '└─────────────────────────┘',
          ].join('\n'),
          uxNotes:
            'GoalBufferSection / TodoEditSection が消え、MorningRoutineSection が表示。セッション中はタスク追加・削除不可。',
        },
        {
          name: 'Session Active（ゴール超過）',
          condition: 'session !== null && goalExceeded',
          screenshotFile: 'dashboard--session-exceeded.png',
          uxNotes: 'goalRemaining が赤系テキスト (colors.primary) で「目標を X:XX 超過!」と表示。',
        },
        {
          name: 'AlarmKit エラー',
          condition: '!isAlarmKitAvailable()',
          screenshotFile: 'dashboard--alarmkit-error.png',
          uxNotes:
            '赤背景バナーがスクロール最上部に表示。タップアクションなし — 設定→権限への導線がない。',
        },
      ],
    },

    // ─────────────────────────────────────────────
    // 2. 設定
    // ─────────────────────────────────────────────
    {
      name: '設定',
      route: '/(tabs)/settings',
      type: 'tab',
      sourceFile: 'app/(tabs)/settings.tsx',
      description: 'アラーム有効/無効、権限管理、日付変更ラインの設定。',
      states: [
        {
          name: '通常（アラーム有効）',
          condition: 'target.enabled === true',
          screenshotFile: 'settings--alarm-enabled.png',
          wireframe: [
            '┌─────────────────────────┐',
            '│  スケジュール        [>] │',
            '├─────────────────────────┤',
            '│  有効              [⊙]  │',
            '├─────────────────────────┤',
            '│  日付変更ライン          │',
            '├─────────────────────────┤',
            '│  権限                    │',
            '│  🔔 AlarmKit   [Granted] │',
            '│  ❤️ HealthKit  [Denied]  │',
            '├─────────────────────────┤',
            '│  Version 1.x.x           │',
            '└─────────────────────────┘',
          ].join('\n'),
        },
        {
          name: '通常（アラーム無効）',
          condition: 'target.enabled === false',
          screenshotFile: 'settings--alarm-disabled.png',
        },
        {
          name: '権限 denied 後',
          condition: 'permissionStatuses[perm.id] === "denied" → Alert表示',
          screenshotFile: 'settings--permission-denied.png',
          uxNotes:
            'Alert で「設定アプリへ」とガイドするが、Linking.openSettings() へのボタンがない',
        },
      ],
    },

    // ─────────────────────────────────────────────
    // 3. オンボーディング
    // ─────────────────────────────────────────────
    {
      name: 'オンボーディング',
      route: '/onboarding',
      type: 'stack',
      sourceFile: 'app/onboarding.tsx',
      description: '初回起動時の6ステップウィザード。時刻設定・TODO登録・権限リクエスト。',
      states: [
        {
          name: 'Step 0: Welcome',
          condition: 'step === 0',
          screenshotFile: 'onboarding--step0-welcome.png',
        },
        {
          name: 'Step 1: Time',
          condition: 'step === 1',
          screenshotFile: 'onboarding--step1-time.png',
        },
        {
          name: 'Step 2: Todos',
          condition: 'step === 2',
          screenshotFile: 'onboarding--step2-todos.png',
        },
        {
          name: 'Step 3: Permission',
          condition: 'step === 3',
          screenshotFile: 'onboarding--step3-permission.png',
        },
        {
          name: 'Step 4: Confirm',
          condition: 'step === 4',
          screenshotFile: 'onboarding--step4-confirm.png',
        },
        {
          name: 'Step 5: Demo',
          condition: 'step === 5',
          screenshotFile: 'onboarding--step5-demo.png',
        },
      ],
    },

    // ─────────────────────────────────────────────
    // 4. 時刻変更
    // ─────────────────────────────────────────────
    {
      name: '時刻変更',
      route: '/target-edit',
      type: 'modal',
      sourceFile: 'app/target-edit.tsx',
      description: '起床時刻の変更。「明日だけ」と「デフォルト変更」の2モード。',
      states: [
        {
          name: '明日だけ変更モード',
          condition: 'mode === "tomorrowOnly"',
          screenshotFile: 'target-edit--tomorrow-only.png',
          wireframe: [
            '┌─────────────────────────┐',
            '│      起床時刻を変更       │',
            '│         ▲    ▲          │',
            '│       07  :  00          │',
            '│         ▼    ▼          │',
            '├─────────────────────────┤',
            '│ ◉ 明日だけ変更           │',
            '│ ○ デフォルトを変更        │',
            '├─────────────────────────┤',
            '│      [ 保存 ]            │',
            '└─────────────────────────┘',
          ].join('\n'),
          uxNotes: '現在の値と変更後の差分が視覚的に分からない',
        },
        {
          name: 'デフォルト変更モード',
          condition: 'mode === "changeDefault"',
          screenshotFile: 'target-edit--change-default.png',
        },
      ],
    },

    // ─────────────────────────────────────────────
    // 5. スケジュール
    // ─────────────────────────────────────────────
    {
      name: 'スケジュール',
      route: '/schedule',
      type: 'modal',
      sourceFile: 'app/schedule.tsx',
      description: '曜日ごとのアラーム時刻設定。デフォルト/カスタム/OFFの3状態。',
      states: [
        {
          name: 'Loading',
          condition: 'target === null',
          screenshotFile: 'schedule--loading.png',
        },
        {
          name: '全曜日デフォルト',
          condition: 'dayOverrides が空',
          screenshotFile: 'schedule--all-default.png',
        },
        {
          name: 'カスタムあり + 編集中',
          condition: '一部の曜日にオーバーライド && editingDay !== null',
          screenshotFile: 'schedule--with-overrides.png',
          wireframe: [
            '┌─────────────────────────┐',
            '│  デフォルト: 07:00       │',
            '├─────────────────────────┤',
            '│  月  デフォルト   07:00  │',
            '│  火  カスタム    08:00   │',
            '│  ┌── ピッカー ──────────┐│',
            '│  │  ▲ 08 : 00 ▲       ││',
            '│  └─────────────────────┘│',
            '│  水  OFF        OFF     │',
            '└─────────────────────────┘',
          ].join('\n'),
          uxNotes: '曜日タップ: default→custom→off→default のサイクル。直感的でない可能性。',
        },
      ],
    },

    // ─────────────────────────────────────────────
    // 6. 日次レビュー
    // ─────────────────────────────────────────────
    {
      name: '日次レビュー',
      route: '/day-review',
      type: 'modal',
      sourceFile: 'app/day-review.tsx',
      description: '特定日の起床記録・睡眠データ・デイリーグレードを確認する。',
      states: [
        {
          name: '記録なし',
          condition: 'record === undefined && gradeRecord === undefined',
          screenshotFile: 'day-review--no-record.png',
        },
        {
          name: 'アラーム記録あり（TODO含む）',
          condition: 'record !== undefined && record.todos.length > 0',
          screenshotFile: 'day-review--with-record.png',
          wireframe: [
            '┌─────────────────────────┐',
            '│     2026-03-22           │',
            '│     [ Great ]            │',
            '├─────────────────────────┤',
            '│  目標 07:00 / 実際 06:55 │',
            '│  結果 -5 min             │',
            '├─────────────────────────┤',
            '│  ✓ 顔を洗う              │',
            '│  ○ 水を飲む              │',
            '├─────────────────────────┤',
            '│  睡眠データ / グレード    │',
            '└─────────────────────────┘',
          ].join('\n'),
        },
        {
          name: 'アラーム未使用 + グレードあり',
          condition: 'record === undefined && gradeRecord !== undefined',
          screenshotFile: 'day-review--no-alarm.png',
          uxNotes:
            'アラーム未使用日でも useGradeFinalization がグレードを自動生成するため、この状態が発生する',
        },
      ],
    },

    // ─────────────────────────────────────────────
    // 7. タブバー（共通レイアウト）
    // ─────────────────────────────────────────────
    {
      name: 'タブバー（共通）',
      route: '/(tabs)/_layout',
      type: 'layout',
      sourceFile: 'app/(tabs)/_layout.tsx',
      description: 'タブバー + MorningRoutineBanner。セッション中はバナーが表示。',
      states: [
        {
          name: 'セッションなし',
          condition: 'session === null',
          screenshotFile: 'tabbar--no-session.png',
        },
        {
          name: 'セッション中（バナー表示）',
          condition: 'session !== null',
          screenshotFile: 'tabbar--with-banner.png',
          uxNotes: 'タブバーの上にバナーが表示。設定タブに切り替えても進捗が見える。',
        },
      ],
    },
  ],

  improvements: [
    {
      priority: 'P1',
      description:
        'Loading 画面にスピナーがない — テキストのみで、初回起動の長時間ロードで不安を与える',
    },
    {
      priority: 'P1',
      description: 'AlarmKit エラーバナーに解決導線がない — 「設定へ」ボタンが必要',
    },
    {
      priority: 'P2',
      description: 'target-edit の差分表示なし — 現在値 → 変更値の比較ができない',
    },
    {
      priority: 'P2',
      description: 'スケジュールの状態遷移 — default→custom→off→default のサイクルが分かりにくい',
    },
    {
      priority: 'P2',
      description:
        '権限 denied 時の設定アプリ遷移 — Alert のみでリンクなし（Linking.openSettings() を使うべき）',
    },
    {
      priority: 'P2',
      description: 'セッション中に TODO 追加不可 — 忘れていたタスクを追加したい場合の手段がない',
    },
    {
      priority: 'P3',
      description:
        'WeeklyStatsCard — レコード0件で非表示だが、初回ユーザーにはガイドテキストがあるとよい',
    },
    {
      priority: 'P3',
      description:
        '日次レビューの日付フォーマット — ISO形式 (2026-03-22) でユーザーフレンドリーではない',
    },
    {
      priority: 'P3',
      description: 'SleepCard の空状態 — HealthKit データなし時のフォールバック表示',
    },
  ],
};
