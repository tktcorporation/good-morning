/**
 * AsyncStorage 永続化キーの単一定義（SSOT）。
 *
 * 各ストアが個別に文字列リテラルを保持していると、キー名の重複・タイポ・
 * 衝突に気づけない。全キーをここに集約し各ストアから参照することで、
 * 永続化キーの一覧と一意性を 1 箇所で担保する。
 *
 * 注意: 値は AsyncStorage 上の既存ユーザーデータと対応するため、
 * 文字列値を変更すると保存済みデータが読めなくなる。リネーム時は
 * マイグレーションが必要。
 */
export const STORAGE_KEYS = {
  wakeTarget: 'wake-target',
  alarmIds: 'alarm-ids',
  morningSession: 'morning-session',
  appSettings: 'app-settings',
  wakeRecords: 'wake-records',
  dailyGrades: 'daily-grades',
  streakState: 'streak-state',
} as const;
