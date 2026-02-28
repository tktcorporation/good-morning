import { calculateBedtime, migrateBedtimeToSleepMinutes } from '../utils/sleep';

describe('calculateBedtime', () => {
  test('基本: alarm 6:00 - 7h = 23:00', () => {
    expect(calculateBedtime({ hour: 6, minute: 0 }, 420)).toEqual({ hour: 23, minute: 0 });
  });
  test('深夜跨ぎ: alarm 7:30 - 8h = 23:30', () => {
    expect(calculateBedtime({ hour: 7, minute: 30 }, 480)).toEqual({ hour: 23, minute: 30 });
  });
  test('同日: alarm 22:00 - 6h = 16:00', () => {
    expect(calculateBedtime({ hour: 22, minute: 0 }, 360)).toEqual({ hour: 16, minute: 0 });
  });
  test('null returns null', () => {
    expect(calculateBedtime({ hour: 6, minute: 0 }, null)).toBeNull();
  });
  test('30分刻み: alarm 6:00 - 7.5h = 22:30', () => {
    expect(calculateBedtime({ hour: 6, minute: 0 }, 450)).toEqual({ hour: 22, minute: 30 });
  });
});

describe('migrateBedtimeToSleepMinutes', () => {
  test('bedtime 23:00 + default 6:00 → 420', () => {
    expect(migrateBedtimeToSleepMinutes({ hour: 23, minute: 0 }, { hour: 6, minute: 0 })).toBe(420);
  });
  test('bedtime 22:30 + default 6:30 → 480', () => {
    expect(migrateBedtimeToSleepMinutes({ hour: 22, minute: 30 }, { hour: 6, minute: 30 })).toBe(
      480,
    );
  });
  test('bedtime 1:00 + default 8:00 → 420', () => {
    expect(migrateBedtimeToSleepMinutes({ hour: 1, minute: 0 }, { hour: 8, minute: 0 })).toBe(420);
  });
  test('clamp min: short diff → 300', () => {
    expect(migrateBedtimeToSleepMinutes({ hour: 5, minute: 0 }, { hour: 6, minute: 0 })).toBe(300);
  });
  test('clamp max: long diff → 600', () => {
    expect(migrateBedtimeToSleepMinutes({ hour: 18, minute: 0 }, { hour: 6, minute: 0 })).toBe(600);
  });
});

describe('migration roundtrip', () => {
  test('migrate then calculateBedtime returns approximately original bedtime', () => {
    const originalBedtime = { hour: 23, minute: 0 };
    const defaultTime = { hour: 6, minute: 0 };
    const sleepMinutes = migrateBedtimeToSleepMinutes(originalBedtime, defaultTime);
    const calculatedBedtime = calculateBedtime(defaultTime, sleepMinutes);
    expect(calculatedBedtime).toEqual(originalBedtime);
  });

  test('migrate then calculateBedtime with midnight crossover', () => {
    const originalBedtime = { hour: 1, minute: 0 };
    const defaultTime = { hour: 8, minute: 0 };
    const sleepMinutes = migrateBedtimeToSleepMinutes(originalBedtime, defaultTime);
    const calculatedBedtime = calculateBedtime(defaultTime, sleepMinutes);
    expect(calculatedBedtime).toEqual(originalBedtime);
  });
});
