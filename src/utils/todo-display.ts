import i18n from '../i18n';
import type { TodoType } from '../types/alarm';

/**
 * 表示用の TODO タイトルを取得する。
 *
 * 背景: 固定種別タスク（'squat' 等）の title は永続化時点のロケールに依存しない
 * 英語リテラル（FIXED_SQUAT_TODO_TITLE 参照）を保存しているため、
 * UI でそのまま render するとロケール変更後にロケール混在が発生する。
 * type 既知のものは i18n でロケライズし、未設定（レガシーデータ）は title を素通し。
 *
 * 呼び出し箇所:
 * - SquatChallengeItem / day-review (アプリ内 UI)
 * - DismissService / RecoveryService / app/(tabs)/index.tsx (Live Activity 連携)
 * - widget-data (ホーム画面ウィジェット)
 */
export function getLocalizedTodoTitle(todo: {
  readonly type?: TodoType;
  readonly title: string;
}): string {
  if (todo.type === 'squat') {
    return i18n.t('morningRoutine.squat.title', { ns: 'dashboard' });
  }
  return todo.title;
}
