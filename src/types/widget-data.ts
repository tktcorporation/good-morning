/**
 * ホームウィジェット（Widget Extension）に表示するデータの型定義。
 *
 * 背景: メインアプリと Widget Extension は App Groups UserDefaults 経由で
 * JSON 文字列としてデータを共有する。この型は JS 側・Swift 側（SharedTypes.swift）
 * の両方で同じ構造を維持する必要がある。
 *
 * ライフサイクル: buildWidgetData() で組み立て → syncWidgetData() で UserDefaults に書き出し
 * → Widget Extension の TimelineProvider が読み取り → WidgetKit で表示
 */

export interface WidgetTodo {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}

export interface WidgetData {
  readonly nextAlarm: {
    readonly time: string; // "HH:mm"
    readonly enabled: boolean;
    readonly label: string; // 曜日ラベル（例: "月"）
  } | null;
  readonly session: {
    readonly todos: readonly WidgetTodo[];
    readonly snoozeFiresAt: string | null;
    readonly progress: { readonly completed: number; readonly total: number };
  } | null;
  readonly streak: {
    readonly currentStreak: number;
    readonly lastGrade: string; // DailyGrade
  };
  readonly updatedAt: string;
}
