/**
 * セッション中のTODO項目。TodoItem（設定テンプレート）から生成され、完了状態を追跡する。
 * セッション完了時に WakeTodoRecord に変換されてレコードに永続化される。
 */
export interface SessionTodo {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
  readonly completedAt: string | null;
}

/**
 * アクティブな朝ルーティンのセッション。
 *
 * 設計変更（2026-03）: セッションはアラーム発火ではなく「時間ウィンドウ」で管理する。
 * アラーム時刻から ±SESSION_WINDOW_*_MINUTES のウィンドウ内であれば、
 * アラーム発火の成否に関わらずセッションが自動開始される。
 * TODO全完了後もウィンドウ終了まで（デフォルト30分後）セッションを維持する。
 *
 * ライフサイクル:
 * - ウィンドウ開始時刻到達 or アラーム dismiss → 作成
 * - ウィンドウ終了時刻到達 → 期限切れとしてクリア
 * - AsyncStorage に永続化されるため、アプリ再起動後も継続する。
 */
export interface MorningSession {
  /**
   * WakeRecord ID。アラーム dismiss 時に紐づけられる。
   * セッションがウィンドウベースで自動開始された場合は null（アラーム dismiss 前）。
   * アラーム dismiss 後に setRecordId で紐づけ。
   */
  readonly recordId: string | null;
  readonly date: string; // YYYY-MM-DD
  readonly startedAt: string; // ISO datetime
  readonly todos: readonly SessionTodo[];
  /**
   * セッションウィンドウの終了時刻（ISO datetime）。
   * この時刻を過ぎるとセッションは期限切れとしてクリアされる。
   * アラーム時刻 + SESSION_WINDOW_AFTER_MINUTES で算出。
   */
  readonly windowEnd: string;
  /**
   * アクティブな Live Activity の ID。更新・終了時に使用。
   * session オブジェクトに含めることで AsyncStorage に永続化され、
   * アプリ再起動後も Live Activity を終了できる。
   * メモリのみだとアプリ kill 後にロック画面に残り続ける問題があった。
   */
  readonly liveActivityId: string | null;
  /**
   * 起床目標デッドライン（ISO datetime）。
   * アラーム dismiss 時に dismissTime + wakeUpGoalBufferMinutes で算出。
   * セッション自動開始時は null（dismiss 前は不明）。
   * この時刻までに全TODOを完了すれば「起きられた」判定（morningPass）。
   */
  readonly goalDeadline: string | null;
  /**
   * 先行スケジュール済みスヌーズの AlarmKit ID 配列。
   * TODO全完了時に cancelAlarmsByIds() で残りをキャンセルする。
   * アラーム dismiss 経由でない自動開始セッションでは空配列。
   */
  readonly snoozeAlarmIds: readonly string[];
  /**
   * 次のスヌーズ発火予定時刻（ISO文字列）。カウントダウン表示に使用。
   */
  readonly snoozeFiresAt: string | null;
}
