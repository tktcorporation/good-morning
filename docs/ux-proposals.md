# UX改善提案書

## 1. 概要

本書は Nielsen のユーザビリティヒューリスティックに基づき、オンボーディング／ホーム画面・起床フロー／アラーム設定編集／設定・情報設計の4フローをコードベースから直接調査し、確認できた問題点と改善案を重要度別にまとめたものである。

読み方: **critical** は起床・完了というアプリの中核機能に直結する、または一部ユーザーを詰ませる問題であり最優先で対応する。**major** は日常利用の質を明確に落とす問題で、フロー別にまとめてある。**minor** は改善の余地がある軽微な項目。**5章**は今回のパスでは検証しきれなかった、次の監査で深掘りすべき観点。**6章**は全体の着手順の提案。

---

## 2. critical（最優先）

### 2-1. オンボーディング: AlarmKit権限がOSレベルで拒否されると詰む

**症状**: `APP_PERMISSIONS` の `alarmKit` は `required: true`（`src/constants/permissions.ts:33-43`）で、オンボーディングの「次へ」ボタンは全必須権限が `granted` になるまで無効化される（`src/components/onboarding/PermissionStep.tsx:62-64, 92-94`）。iOS は権限ダイアログを一度 deny すると二度とシステムダイアログを表示しないため、`request()` の再実行では復旧できない。オンボーディング画面自体は `app/_layout.tsx:145`（`headerShown: false`）で、かつ `onboardingDone === false` の間は `app/_layout.tsx:111-115` の `router.replace('/onboarding')` により他画面への抜け道がない。

**影響**: AlarmKit権限を一度でも拒否した、またはOS側で制限されている全ユーザーがオンボーディングを完了できず、アプリが恒久的に使用不能になる。

**提案**: 拒否状態を検知したら iOS 設定アプリへ誘導し、フォアグラウンド復帰時に権限状態を再チェックする。

**(このセッションで修正済み)** — `PermissionStep.tsx:133-139` の `handlePress` が `status === 'denied'` の場合に `Linking.openSettings()` を呼び出し、`PermissionStep.tsx:49-59` の `AppState` リスナーがフォアグラウンド復帰のたびに未許可の権限を実際に再リクエストする。

---

### 2-2. ホーム画面: 起床セッション中のUIが埋もれる

**症状（修正前）**: セッションアクティブ時にモーニングルーティンの進捗・カウントダウン・TODOチェックリストが、セッション非アクティブ時専用の「明日のターゲット時刻」等のコンテンツと同時に表示され、スクロールしないと見えない構成になっていた。

**影響**: アラームが鳴りタスクをこなしている最中のユーザーが、今やるべきことを見るために毎回スクロールを要する。

**提案**: セッションアクティブ時は進捗・タスクUIを画面最上部に配置する。

**(このセッションで修正済み)** — `app/(tabs)/index.tsx:416-454` の `sessionActive && progress !== null` の分岐により、セッションアクティブ時は `MorningRoutineSection`（同416-426）がAlarmKit警告バナーの直後・コンテンツ最上部に単独表示され、非アクティブ時専用の `targetSection` 等（427-454）はレンダリングされない。

---

### 2-3. スケジュール編集: 曜日タップの循環方式によるアラーム誤消去リスク

**症状（修正前）**: 曜日行全体タップで `default → custom → off → default` と循環させる方式では、ピッカーを閉じるだけのつもりのタップが `off`（=その曜日のアラーム無効化）に化けたり、`off` から戻すと `customTime` が `defaultTime` にリセットされる事故があった（`app/schedule.tsx:66-73` のコメントに経緯が明記されている）。

**影響**: ユーザーが気づかぬうちに特定曜日のアラームが無効化される、またはカスタム時刻が消える。

**提案**: `default` / `custom` / `off` を独立した選択肢として提示し、タップと状態変更を1:1に対応させる。

**(このセッションで修正済み)** — `app/schedule.tsx:74-106` の `DaySegmentedControl` が3状態を明示的なセグメントとして提供しており、`handleDaySegmentSelect`（117-141）は選択されたセグメントに応じて `removeDayOverride` / `setDayOverride` を直接呼ぶのみで、循環処理は存在しない。

---

### 2-4. 設定画面: 権限バッジがキャッシュのみでOS実態を反映しない

**症状（修正前）**: 権限バッジは `AsyncStorage` に永続化された `healthKitEnabled` / `alarmKitGranted` フラグの初期値のみを表示しており、OS側で権限状態が変化しても画面には反映されなかった。

**影響**: iOS設定アプリで権限を許可・拒否し直しても、アプリ内表示が古いまま残り、ユーザーが自分の設定状態を誤認する。

**提案**: フォアグラウンド復帰時に実際のOS権限状態を再チェックし、拒否時は設定アプリへ誘導する。

**(このセッションで修正済み)** — `app/(tabs)/settings.tsx:129-139` の `AppState` リスナーが未許可の権限を `handlePermissionRequest` 経由で実際に再リクエスト（＝OSへの問い合わせ）し、失敗時は同ファイル113-120の `Alert.alert` から `Linking.openSettings()`（118行目）へ誘導する。

ただし、一度 `'granted'` と判定された権限は `settings.tsx:132-134` の条件 `permissionStatuses[perm.id] !== 'granted'` により以後の再チェック対象から外れるため、許可後にOS側で取り消された場合はバッジが「許可済み」のまま更新されない残存ギャップがある（4-4に詳細を記載）。

---

### 2-5. target-edit: 「明日だけ変更」が実際には「今日」に適用されることがある

**症状**: 「明日だけ変更」モードで保存すると `setNextOverride(time)` → `computeOverrideTargetDate(time)` が呼ばれる（`app/target-edit.tsx:41-42`、`src/stores/wake-target-store.ts:125-133`）。`computeOverrideTargetDate`（`src/types/wake-target.ts:130-137`）は「指定時刻が本日中にまだ来ていなければ今日、既に過ぎていれば明日」というアラーム再スケジュール用のロジック（`scheduleWakeTargetAlarm` と共用、同ファイル126-129のコメントに明記）をそのまま流用しており、「明日」であることを保証しない。例えば当日14時にこの画面を開き、時刻を今夜21時にセットして「明日だけ変更」を選ぶと、`targetDate` は「今日」になり、オーバーライドは今夜のうちに発火する。

**影響**: 「明日だけ」のつもりで設定したユーザーが、当日中に想定外の時刻でアラームを鳴らされる可能性がある。逆に翌朝にはオーバーライドが期限切れ（`isNextOverrideExpired`、`wake-target.ts:115-124`）として扱われ、通常のデフォルト設定に静かに戻る。UI文言（`targetEdit.tomorrowOnly` = 「明日だけ変更」）と実際の挙動が乖離しており、アラームアプリの中核機能である「狙った時刻に鳴らす」を直接損なう。

**提案**: 「明日」を「現在時刻の翌日」に固定して計算する専用ロジックを用意し、アラーム再スケジュール用の `computeOverrideTargetDate` とは別に扱う。

未修正。

---

### 2-6. day-review: 日付境界の解決方法が画面内で不整合

**症状**: `app/day-review.tsx:30` の `record` 検索は URL パラメータ `date` をそのまま `records` の `date` フィールドと文字列比較する。一方 `day-review.tsx:36-37` では `reviewDate = new Date(`${date}T00:00:00`)` を作って `useDailySummary(reviewDate)` に渡し、`src/hooks/useDailySummary.ts:32-35` はこれを `getLogicalDateString(date, dayBoundaryHour)` で改めて解決する。`dayBoundaryHour` のデフォルト値は `3`（`src/stores/settings-store.ts:6`）であり、`00:00` はこの境界時刻より前のため `src/utils/date.ts:44-51` の `getLogicalDate` が前日にずらす。結果として、`date=2026-07-20` で開いたレビュー画面でも、睡眠セクション（`SleepDetailSection`）は `2026-07-19` のデータを参照する。

**影響**: `dayBoundaryHour` がデフォルト値のままの全ユーザーが、レビュー画面の上部（起床結果）と下部（睡眠データ）で異なる日付のデータを同時に見せられる。画面上にこの矛盾を示す警告は一切なく、健康データの日付対応が常に1日ずれる。

**提案**: `day-review.tsx` で `reviewDate` を構築する際に `getLogicalDateString` と整合する形にする（境界時刻の影響を受けない時刻を使う、または日付解決ロジックを1箇所に統一する）。

未修正。

---

## 3. major

### オンボーディング

- **5分刻みであることが画面上に示されない**: `TimeStep.tsx:15-16` の `MINUTES = Array.from({length:12},(_,i)=>i*5)` により分のピッカーは5分刻み固定だが、説明テキストが一切ない。ピッカー付近に「5分単位」である旨を明記する。
- **ステップ状態がバックグラウンド化・プロセス終了で消える**: `onboarding.tsx:26-28` の `step` / `defaultTime` / `alarmEnabled` は `useState` のみで保持され、`AsyncStorage` 等への永続化がない。OSにプロセスを終了されると最初の `WelcomeStep` からやり直しになる。主要な入力を逐次永続化する。
- **DemoStepが「体験」を約束しながら実質何もない**: `src/i18n/locales/ja/onboarding.json:46-48` に `demo.start` / `demo.complete` / `demo.skip` キーが定義されているが、`DemoStep.tsx` はどこからも参照せず（使用するのは `demo.title` / `demo.subtitle` と汎用の `back` / `next` のみ）、「朝のアラームがどんな感じか体験してみましょう」という文言に反して実際のデモ操作が存在しない。コピーを実情に合わせるか、実際のプレビュー体験を実装する。
- **権限が一度 granted になると再検証されない（PermissionStep側）**: `PermissionStep.tsx:52-56` の `AppState` リスナーは `statuses.get(permission.id) !== 'granted'` の権限のみ再チェックするため、許可後にOS側で取り消されても検知できない。

### ホーム・起床フロー

- **day-reviewに閉じる手段がなくタイトルも空**: `app/_layout.tsx:161-167` の `Stack.Screen(name="day-review")` は `presentation: 'modal'`、`title: ''` のみで、明示的な閉じるボタンや文脈を示すタイトルがなく、スワイプダウンのみが離脱手段になっている。ヘッダーに閉じるボタンと日付等のタイトルを追加する。
- **StreakBadgeが常に「現在の」ストリークを表示する**: `day-review.tsx:28` の `gradeStreak` は `useDailyGradeStore(s => s.streak)` というグローバルな現在値をそのまま使い、`StreakBadge.tsx:33` は `t('streak.current', ...)` で明示的に「現在」ラベルを使う。過去日のレビュー画面でも「今日時点のストリーク」が表示され、その日時点の実際のストリークとは異なりうる。レビュー対象日時点のストリーク値を別途算出して渡す。
- **週間カレンダーの日タップにアフォーダンスがない**: `app/(tabs)/index.tsx:103-109` の `Pressable`（dayColumn）に `accessibilityRole` も背景変化やシェブロンもなく、タップ可能であることを示す視覚的手がかりが `isToday` の強調以外にない。`accessibilityRole="button"` と押下時のハイライトを追加する。
- **TODO全完了時のフィードバックが皆無**: `src/i18n/locales/ja/dashboard.json:18` に `morningRoutine.allDone`（「全タスク完了!」）キーが定義済みだが、コード内のどこからも参照されておらず、`MorningRoutineSection`（`index.tsx:121-189`）にも完了時専用の表示がない。このキーを使って全完了状態を明示する。
- **目標カウントダウンとスヌーズカウントダウンが視覚的に紛らわしい**: `index.tsx:555-577` の `goalCountdownText` / `goalExceededText` / `snoozeCountdownText` はほぼ同じフォントサイズ・配置で縦に並ぶだけで、アイコン等による区別がない。色・アイコンで「目標」と「スヌーズ」を判別しやすくする。

### アラーム設定編集

- **schedule.tsxのデフォルト時刻セクションが編集不可・導線なし**: `app/schedule.tsx:160-163` の `defaultTimeSection` はテキスト表示のみで `onPress` がなく、デフォルト時刻の変更が `target-edit.tsx`（「デフォルトを変更」モード）経由でしかできないことを示す説明もリンクもない。タップで `target-edit.tsx` に遷移する導線か注記を追加する。
- **target-edit.tsxが既存オーバーライドの有無を示さない**: `target-edit.tsx:20-29` の `currentResolvedTime` は `nextOverride > dayOverride > defaultTime` の優先順位で解決済みの値をそのまま初期値にするだけで、それが「通常のデフォルト」なのか「既存の明日だけオーバーライド」なのかを示すラベルがない。既存オーバーライドがあればその旨を明示する。
- **target-edit.tsxに既存オーバーライドを取り消す手段がない**: `src/stores/wake-target-store.ts:135-142` に `clearNextOverride` が実装済みだが、`target-edit.tsx` はどこからも呼び出していない。一度「明日だけ変更」を設定すると、新しい時刻で上書きする以外に取り消す方法がUI上にない。「オーバーライドを解除」ボタンを追加する。

### 設定・情報設計

- **権限ステータスの pending と denied が同じ表示になる**: `settings.tsx:196-215` の `isGranted` は true/false の2値判定のみで、初期値 `'pending'`（未リクエスト）でも `t('settings.permissionDenied')` と同じ「拒否」ラベル・警告色（`statusDenied`）で表示される。一度も権限を尋ねていないユーザーにまで「拒否」と表示されてしまう。pending / denied / granted の3状態を区別して表示する。
- **権限が一度 granted になると再検証されない（settings側）**: `settings.tsx:132-134` の for ループは `permissionStatuses[perm.id] !== 'granted'` の権限のみ再チェック対象とするため、許可後にOS側で権限を取り消されてもバッジは「許可済み」のまま更新されない。表示のたびに実OS状態を問い合わせる。

---

## 4. minor

### オンボーディング

- ステップドット（`onboarding.tsx:64-68`）に進捗を示す `accessibilityRole` / `accessibilityLabel` がない — スクリーンリーダー利用者が現在位置を把握できない。
- ConfirmStepの「あとで」選択時にアラームが設定されない旨が明示されない（`ConfirmStep.tsx:30-35`、`onboarding.json:39` の `confirm.subtitle` は選択に関わらず同じ文言）— 選択肢に応じて文言を出し分ける。

### ホーム・起床フロー

- `WeeklyStatsCard` はレコード0件時に何も表示しない（`index.tsx:56`）— 初回利用者が「なぜ表示されないか」分からない。空状態メッセージを追加する。
- `GoalBufferSection` の `+` / `-` ボタンに `accessibilityLabel` がない（`index.tsx:228-246`）。
- `SquatChallengeItem` の「検出中」表示（`activeIndicator`）は `Pressable` だが `onPress` が渡されておらず、タップしても何も起きない（`SquatChallengeItem.tsx:102`）— 装飾目的なら `View` にする。
- `alarmKitUnavailable` のエラーバナー文言が開発者向け（「Development Buildを再ビルドしてください」、`dashboard.json:70`）— エンドユーザー向けの文言に改める。

### アラーム設定編集

- `schedule.tsx` の `InlineTimePicker` ▲▼ ボタンに `accessibilityLabel` がない（`schedule.tsx:44-64`）。
- `target-edit.tsx` の ▲▼ ピッカーにも同様に `accessibilityLabel` がない（`target-edit.tsx:56-74`）。

### 設定・情報設計

- バージョン情報が `expoConfig` 欠落時に無言で `"0.0.0"` にフォールバックする（`settings.tsx:225`）— 開発ビルドで異常に気づきにくい。

---

## 5. 監査自体の抜け（次に見るべき観点）

- **アクセシビリティ網羅性**: `accessibilityLabel` / `accessibilityRole` は `src` / `app` 全体で6箇所のみ（`PermissionStep.tsx`、`StepButton.tsx`、`TodoListItem.tsx` の3ファイルに限定）。`Pressable` を使用するファイルは14あり、残り11ファイル（`schedule.tsx`、`target-edit.tsx`、`index.tsx`、`settings.tsx`、`DayBoundaryPicker.tsx`、`SleepDurationCard.tsx`、`MorningRoutineBanner.tsx`、`SquatChallengeItem.tsx`、`SleepDurationPickerModal.tsx`、`sleep/SleepCard.tsx`、`squat-check.tsx`）にはアクセシビリティ属性が一切ない。VoiceOverでの実機操作性を体系的に検証する必要がある。
- **英語ロケールのレイアウト崩れ**: 現状 `ja` / `en` の2ロケールがあるが、英語版で日本語より長くなりがちな文字列（ボタンラベル、バッジテキスト等）によるレイアウト崩れ（折り返し、ピッカー幅超過等）を検証した形跡がない。
- **通知・ロック画面・Live Activity UX**: 起床体験はアプリを開く前、AlarmKitの通知・ロック画面・Live Activity上で始まる。`src/services` にAlarmKit連携があるが、ロック画面やDynamic Island上のUXそのもの（ボタン配置、スヌーズ導線、視認性）は今回のコードリーディングの対象外であり、実機での検証が必要。
- **空・ローディング・エラー状態の一貫性**: 今回確認した範囲でも `loaded === false` 時の表示は画面ごとに単純なテキストのみ（`index.tsx:395-401`、`schedule.tsx:150-156`）で、HealthKit取得失敗時やAlarmKit初期化失敗時のエラー提示も画面ごとにバラバラ。全画面横断での一貫性を検証する必要がある。
- **触覚・音声フィードバックの不在**: `expo-haptics` は `package.json` にもコード内にも見当たらない。スクワット1回検出時（`useSquatDetector.ts`）も視覚的なプログレスリング更新のみで、「寝ぼけた状態での操作確認」という機能目的に対し振動フィードバックがない。導入の是非を検討する価値がある。
- **`RESULT_COLORS` の `great` / `ok` 同色問題**: `src/constants/theme.ts:59-64` で `great: colors.success` と `ok: colors.success` に同一色が割り当てられており、`day-review.tsx:59, 81` のバッジ色は「great」と「ok」で視覚的に区別できない（文言では区別されるが色のみでは判別不能）。グレード表示全般で色の割り当てを見直す必要がある。

---

## 6. 優先順位の提案

critical の4件（オンボーディング権限詰み、ホーム画面のセッションUI埋没、スケジュールの曜日タップ誤消去、設定画面の権限バッジ不整合）はこのセッションで修正済み。残る2件の未修正critical（target-editの「明日だけ変更」対象日ロジック、day-reviewの日付境界不整合）は共に「静かに間違った日付・時刻を使う」系のバグで、ユーザーが気づきにくい割に実害（意図しない時刻での鳴動、健康データの誤対応）が大きいため次に着手すべきである。

major のうち設定・情報設計グループ（pending/deniedの表示混同、granted後の再検証なし）は、今回修正済みのcritical「権限バッジの信頼性向上」と同じ文脈にあるため、合わせて着手すると効率的である。

アラーム設定編集グループの「オーバーライドを取り消せない」「schedule.tsxからtarget-editへの導線がない」は、オンボーディングの `TimeStep`、`schedule.tsx` の `InlineTimePicker`、`target-edit.tsx` の独自ピッカー、`DayBoundaryPicker.tsx` という4つの異なる実装に分かれている「時刻ピッカー」を共通コンポーネント化する回でまとめて解消するのが望ましい。個別のインクリメンタルな修正を重ねるより、時刻ピッカー統一を専用のフォローアップとして先に設計する方が手戻りが少ない。

アクセシビリティ・触覚フィードバック・多言語レイアウト・通知/ロック画面UXは今回のパスでは深掘りしておらず、次回は専用の監査サイクルを設けることを推奨する。
