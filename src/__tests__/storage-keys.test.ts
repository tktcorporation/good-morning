import { STORAGE_KEYS } from '../constants/storage-keys';

// AsyncStorage の永続化キーは既存ユーザーのデータと対応するため、値を変更すると
// 保存済みデータが読めなくなる。意図しないリネームを検知するためのピンテスト。
describe('STORAGE_KEYS', () => {
  it('永続化キーの値は固定（変更時はマイグレーションが必要）', () => {
    expect(STORAGE_KEYS).toEqual({
      wakeTarget: 'wake-target',
      alarmIds: 'alarm-ids',
      morningSession: 'morning-session',
      appSettings: 'app-settings',
      wakeRecords: 'wake-records',
      dailyGrades: 'daily-grades',
      streakState: 'streak-state',
      onboardingCompleted: 'onboarding-completed',
    });
  });

  it('キーの値に重複がない', () => {
    const values = Object.values(STORAGE_KEYS);
    expect(new Set(values).size).toBe(values.length);
  });
});
