jest.mock('@kingstinct/react-native-healthkit', () => ({
  CategoryValueSleepAnalysis: { inBed: 0 },
  isHealthDataAvailable: jest.fn(() => false),
  queryCategorySamples: jest.fn(),
  requestAuthorization: jest.fn(),
}));

import { extractMainSleepSession } from '../services/health';

describe('extractMainSleepSession', () => {
  it('returns null for empty samples', () => {
    expect(extractMainSleepSession([])).toBeNull();
  });

  it('returns the single session for a single sample', () => {
    const samples = [
      { startDate: new Date('2026-02-26T23:00:00'), endDate: new Date('2026-02-27T07:00:00') },
    ];
    const result = extractMainSleepSession(samples);
    expect(result).not.toBeNull();
    expect(result?.totalMinutes).toBe(480); // 8 hours
  });

  it('merges continuous samples into one session', () => {
    // 2つの隣接サンプル（ギャップ30分 < 閾値60分）
    const samples = [
      { startDate: new Date('2026-02-26T23:00:00'), endDate: new Date('2026-02-27T03:00:00') },
      { startDate: new Date('2026-02-27T03:30:00'), endDate: new Date('2026-02-27T07:00:00') },
    ];
    const result = extractMainSleepSession(samples);
    expect(result).not.toBeNull();
    expect(result?.totalMinutes).toBe(480); // 23:00-07:00 = 8 hours
  });

  it('separates nap from night sleep and returns the longest', () => {
    // 昼寝（17:00-19:00, 2時間）+ 夜の睡眠（0:00-9:00, 9時間）
    // ギャップ = 5時間 > 60分閾値 → 別セッション
    const samples = [
      { startDate: new Date('2026-02-26T17:00:00'), endDate: new Date('2026-02-26T19:00:00') },
      { startDate: new Date('2026-02-27T00:00:00'), endDate: new Date('2026-02-27T09:00:00') },
    ];
    const result = extractMainSleepSession(samples);
    expect(result).not.toBeNull();
    // 最も長い夜の睡眠セッションが選ばれる
    expect(result?.start).toEqual(new Date('2026-02-27T00:00:00'));
    expect(result?.end).toEqual(new Date('2026-02-27T09:00:00'));
    expect(result?.totalMinutes).toBe(540); // 9 hours
  });

  it('handles the user scenario: nap 17:00-19:00 + night 0:00-9:00', () => {
    // ユーザーの具体例: 昼寝が17-19時、夜が0-9時
    // 以前は17:00-翌日9:00=16時間と計算されていた
    const samples = [
      { startDate: new Date('2026-02-26T17:00:00'), endDate: new Date('2026-02-26T19:00:00') },
      { startDate: new Date('2026-02-27T00:00:00'), endDate: new Date('2026-02-27T09:00:00') },
    ];
    const result = extractMainSleepSession(samples);
    expect(result).not.toBeNull();
    // 9時間の夜の睡眠が選択されること（16時間ではない）
    expect(result?.totalMinutes).toBe(540);
  });

  it('handles multiple sessions and picks the longest', () => {
    // 3セッション: 昼寝2h、夕寝1.5h、夜7h
    const samples = [
      { startDate: new Date('2026-02-26T14:00:00'), endDate: new Date('2026-02-26T16:00:00') },
      { startDate: new Date('2026-02-26T18:00:00'), endDate: new Date('2026-02-26T19:30:00') },
      { startDate: new Date('2026-02-27T00:00:00'), endDate: new Date('2026-02-27T07:00:00') },
    ];
    const result = extractMainSleepSession(samples);
    expect(result).not.toBeNull();
    expect(result?.totalMinutes).toBe(420); // 7 hours (night sleep)
    expect(result?.start).toEqual(new Date('2026-02-27T00:00:00'));
  });

  it('handles overlapping samples within a session', () => {
    // 重複するサンプル（Apple Watch と iPhone の両方で記録された場合）
    const samples = [
      { startDate: new Date('2026-02-26T23:00:00'), endDate: new Date('2026-02-27T06:00:00') },
      { startDate: new Date('2026-02-26T23:30:00'), endDate: new Date('2026-02-27T07:00:00') },
    ];
    const result = extractMainSleepSession(samples);
    expect(result).not.toBeNull();
    expect(result?.totalMinutes).toBe(480); // 23:00-07:00 = 8 hours
  });

  it('handles unsorted samples correctly', () => {
    // ソートされていないサンプル
    const samples = [
      { startDate: new Date('2026-02-27T00:00:00'), endDate: new Date('2026-02-27T07:00:00') },
      { startDate: new Date('2026-02-26T17:00:00'), endDate: new Date('2026-02-26T19:00:00') },
    ];
    const result = extractMainSleepSession(samples);
    expect(result).not.toBeNull();
    expect(result?.totalMinutes).toBe(420); // 7 hours (night sleep)
  });

  it('short toilet break does not split session', () => {
    // トイレ休憩（10分ギャップ < 60分閾値）
    const samples = [
      { startDate: new Date('2026-02-26T23:00:00'), endDate: new Date('2026-02-27T03:00:00') },
      { startDate: new Date('2026-02-27T03:10:00'), endDate: new Date('2026-02-27T07:00:00') },
    ];
    const result = extractMainSleepSession(samples);
    expect(result).not.toBeNull();
    // 1セッションとして扱われる（23:00-07:00 = 8 hours）
    expect(result?.totalMinutes).toBe(480);
  });
});
