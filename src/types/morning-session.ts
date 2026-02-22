export interface SessionTodo {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
  readonly completedAt: string | null;
}

export interface MorningSession {
  readonly recordId: string; // WakeRecord ID
  readonly date: string; // YYYY-MM-DD
  readonly startedAt: string; // ISO datetime
  readonly todos: readonly SessionTodo[];
}
