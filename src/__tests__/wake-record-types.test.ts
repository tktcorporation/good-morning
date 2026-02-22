import { calculateWakeResult, createWakeRecordId } from '../types/wake-record';

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
