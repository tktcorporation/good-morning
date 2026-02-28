import {
  calculateDiffMinutes,
  calculateWakeResult,
  createWakeRecordId,
} from '../types/wake-record';

describe('createWakeRecordId', () => {
  it('generates unique IDs starting with "wake_"', () => {
    const id1 = createWakeRecordId();
    const id2 = createWakeRecordId();
    expect(id1.startsWith('wake_')).toBe(true);
    expect(id1).not.toBe(id2);
  });
});

describe('calculateWakeResult', () => {
  it('returns "great" when within 5 minutes of target', () => {
    expect(calculateWakeResult(3)).toBe('great');
    expect(calculateWakeResult(-3)).toBe('great');
    expect(calculateWakeResult(0)).toBe('great');
  });

  it('returns "ok" when 5-15 minutes late', () => {
    expect(calculateWakeResult(6)).toBe('ok');
    expect(calculateWakeResult(15)).toBe('ok');
  });

  it('returns "late" when more than 15 minutes late', () => {
    expect(calculateWakeResult(16)).toBe('late');
    expect(calculateWakeResult(60)).toBe('late');
  });

  it('returns "great" when early (negative diff)', () => {
    expect(calculateWakeResult(-10)).toBe('great');
    expect(calculateWakeResult(-30)).toBe('great');
  });
});

describe('calculateDiffMinutes', () => {
  it('returns positive diff when actual is later than target', () => {
    const actual = new Date('2026-02-28T07:10:00');
    expect(calculateDiffMinutes({ hour: 7, minute: 0 }, actual)).toBe(10);
  });

  it('returns negative diff when actual is earlier than target', () => {
    const actual = new Date('2026-02-28T06:55:00');
    expect(calculateDiffMinutes({ hour: 7, minute: 0 }, actual)).toBe(-5);
  });

  it('handles midnight crossing: target 23:50, actual 0:10 → +20 (late)', () => {
    // 深夜跨ぎ: 23:50 アラーム → 0:10 dismiss = 20分遅刻
    const actual = new Date('2026-03-01T00:10:00');
    expect(calculateDiffMinutes({ hour: 23, minute: 50 }, actual)).toBe(20);
  });

  it('handles midnight crossing: target 0:05, actual 23:50 → -15 (early)', () => {
    // 逆方向の深夜跨ぎ: 0:05 アラーム → 23:50 前日 = 15分早い
    const actual = new Date('2026-02-28T23:50:00');
    expect(calculateDiffMinutes({ hour: 0, minute: 5 }, actual)).toBe(-15);
  });

  it('returns 0 when actual matches target exactly', () => {
    const actual = new Date('2026-02-28T07:30:00');
    expect(calculateDiffMinutes({ hour: 7, minute: 30 }, actual)).toBe(0);
  });
});
