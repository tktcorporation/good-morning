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
}
