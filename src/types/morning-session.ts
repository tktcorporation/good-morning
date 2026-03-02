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
 * アラーム解除時（wakeup.tsx の handleDismiss）に作成され、
 * TODO全完了時（index.tsx の completion effect）にレコード更新後クリアされる。
 * AsyncStorage に永続化されるため、アプリ再起動後も継続する。
 */
export interface MorningSession {
  readonly recordId: string; // WakeRecord ID
  readonly date: string; // YYYY-MM-DD
  readonly startedAt: string; // ISO datetime
  readonly todos: readonly SessionTodo[];
  /**
   * アクティブな Live Activity の ID。更新・終了時に使用。
   * session オブジェクトに含めることで AsyncStorage に永続化され、
   * アプリ再起動後も Live Activity を終了できる。
   * メモリのみだとアプリ kill 後にロック画面に残り続ける問題があった。
   */
  readonly liveActivityId: string | null;
  /**
   * 起床目標デッドライン（ISO datetime）。
   * アラーム時刻 + wakeUpGoalBufferMinutes で算出。
   * この時刻までに全TODOを完了すれば「起きられた」判定（morningPass）。
   * null の場合はレガシーデータ（バッファ未設定時代のセッション）。
   */
  readonly goalDeadline: string | null;
  /**
   * 先行スケジュール済みスヌーズの AlarmKit ID 配列。
   * TODO全完了時に cancelAlarmsByIds() で残りをキャンセルする。
   * 従来はメモリのみだったが、アプリ kill → 再起動後も ID ベースキャンセルを
   * 可能にするため MorningSession に含めて永続化する。
   */
  readonly snoozeAlarmIds: readonly string[];
  /**
   * 次のスヌーズ発火予定時刻（ISO文字列）。カウントダウン表示に使用。
   * 従来はメモリのみで restoreSnoozeCountdown() による逆算が必要だったが、
   * 永続化により再起動後もそのまま読み込める。
   */
  readonly snoozeFiresAt: string | null;
}
