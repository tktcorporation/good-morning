import { buildGradeRecord } from '../services/grade-finalizer';
import type { AlarmTime } from '../types/alarm';
import type { WakeRecord } from '../types/wake-record';

/**
 * テスト用の WakeRecord ファクトリ。
 * 必須フィールドをデフォルト値で埋め、テストごとに上書きできる。
 */
function createTestRecord(overrides: Partial<WakeRecord> = {}): WakeRecord {
  return {
    id: 'wake_test_001',
    alarmId: 'alarm_test_001',
    date: '2026-02-26',
    targetTime: { hour: 7, minute: 0 },
    alarmTriggeredAt: '2026-02-26T07:00:00.000Z',
    dismissedAt: '2026-02-26T07:02:00.000Z',
    healthKitWakeTime: null,
    result: 'great',
    diffMinutes: 2,
    todos: [],
    todoCompletionSeconds: 0,
    alarmLabel: 'Test Alarm',
    todosCompleted: true,
    todosCompletedAt: null,
    ...overrides,
  };
}

describe('buildGradeRecord', () => {
  const testDate = '2026-02-26';
  const bedtimeTarget: AlarmTime = { hour: 23, minute: 0 };

  describe('morningPass determination', () => {
    it('sets morningPass=true when WakeRecord result is "great"', () => {
      const record = createTestRecord({ result: 'great' });
      const grade = buildGradeRecord(testDate, record, null, null);
      expect(grade.morningPass).toBe(true);
    });

    it('sets morningPass=true when WakeRecord result is "ok"', () => {
      const record = createTestRecord({ result: 'ok' });
      const grade = buildGradeRecord(testDate, record, null, null);
      expect(grade.morningPass).toBe(true);
    });

    it('sets morningPass=false when WakeRecord result is "late"', () => {
      const record = createTestRecord({ result: 'late' });
      const grade = buildGradeRecord(testDate, record, null, null);
      expect(grade.morningPass).toBe(false);
    });

    it('sets morningPass=false when WakeRecord result is "missed"', () => {
      const record = createTestRecord({ result: 'missed' });
      const grade = buildGradeRecord(testDate, record, null, null);
      expect(grade.morningPass).toBe(false);
    });

    it('sets morningPass=false when no WakeRecord exists', () => {
      const grade = buildGradeRecord(testDate, undefined, null, null);
      expect(grade.morningPass).toBe(false);
    });
  });

  describe('bedtimeResult determination', () => {
    it('returns "noData" when both bedtimeTarget and sleepBedtime are null', () => {
      const record = createTestRecord();
      const grade = buildGradeRecord(testDate, record, null, null);
      expect(grade.bedtimeResult).toBe('noData');
    });

    it('returns "noData" when bedtimeTarget is null (even with sleep data)', () => {
      const record = createTestRecord();
      const grade = buildGradeRecord(testDate, record, null, '2026-02-25T23:00:00.000Z');
      expect(grade.bedtimeResult).toBe('noData');
    });

    it('returns "noData" when sleepBedtime is null (even with target)', () => {
      const record = createTestRecord();
      const grade = buildGradeRecord(testDate, record, bedtimeTarget, null);
      expect(grade.bedtimeResult).toBe('noData');
    });

    it('returns "onTime" when actual bedtime is within 30 min of target', () => {
      const record = createTestRecord();
      const grade = buildGradeRecord(testDate, record, bedtimeTarget, '2026-02-25T23:15:00.000Z');
      expect(grade.bedtimeResult).toBe('onTime');
    });

    it('returns "late" when actual bedtime exceeds 30 min tolerance', () => {
      const record = createTestRecord();
      const grade = buildGradeRecord(testDate, record, bedtimeTarget, '2026-02-26T00:00:00.000Z');
      expect(grade.bedtimeResult).toBe('late');
    });
  });

  describe('grade calculation (2-axis matrix)', () => {
    it('returns "excellent" when morningPass=true and bedtime onTime', () => {
      const record = createTestRecord({ result: 'great' });
      const grade = buildGradeRecord(testDate, record, bedtimeTarget, '2026-02-25T23:10:00.000Z');
      expect(grade.grade).toBe('excellent');
    });

    it('returns "good" when morningPass=true and bedtime noData', () => {
      const record = createTestRecord({ result: 'ok' });
      const grade = buildGradeRecord(testDate, record, null, null);
      expect(grade.grade).toBe('good');
    });

    it('returns "good" when morningPass=true and bedtime late', () => {
      const record = createTestRecord({ result: 'great' });
      const grade = buildGradeRecord(testDate, record, bedtimeTarget, '2026-02-26T01:00:00.000Z');
      expect(grade.grade).toBe('good');
    });

    it('returns "fair" when morningPass=false and bedtime onTime', () => {
      const record = createTestRecord({ result: 'late' });
      const grade = buildGradeRecord(testDate, record, bedtimeTarget, '2026-02-25T23:10:00.000Z');
      expect(grade.grade).toBe('fair');
    });

    it('returns "poor" when morningPass=false and bedtime noData', () => {
      const grade = buildGradeRecord(testDate, undefined, null, null);
      expect(grade.grade).toBe('poor');
    });

    it('returns "poor" when morningPass=false and bedtime late', () => {
      const record = createTestRecord({ result: 'missed' });
      const grade = buildGradeRecord(testDate, record, bedtimeTarget, '2026-02-26T01:00:00.000Z');
      expect(grade.grade).toBe('poor');
    });
  });

  describe('output record structure', () => {
    it('sets date to the provided dateStr', () => {
      const grade = buildGradeRecord('2026-03-01', undefined, null, null);
      expect(grade.date).toBe('2026-03-01');
    });

    it('formats bedtimeTarget as HH:mm string', () => {
      const target: AlarmTime = { hour: 22, minute: 5 };
      const grade = buildGradeRecord(testDate, undefined, target, null);
      expect(grade.bedtimeTarget).toBe('22:05');
    });

    it('pads single-digit hour and minute in bedtimeTarget', () => {
      const target: AlarmTime = { hour: 1, minute: 0 };
      const grade = buildGradeRecord(testDate, undefined, target, null);
      expect(grade.bedtimeTarget).toBe('01:00');
    });

    it('sets bedtimeTarget to null when no target is provided', () => {
      const grade = buildGradeRecord(testDate, undefined, null, null);
      expect(grade.bedtimeTarget).toBeNull();
    });

    it('sets actualBedtime to the provided sleepBedtime', () => {
      const bedtime = '2026-02-25T23:00:00.000Z';
      const grade = buildGradeRecord(testDate, undefined, bedtimeTarget, bedtime);
      expect(grade.actualBedtime).toBe(bedtime);
    });

    it('sets actualBedtime to null when no sleep data', () => {
      const grade = buildGradeRecord(testDate, undefined, null, null);
      expect(grade.actualBedtime).toBeNull();
    });
  });

  describe('multi-day gap scenario (no WakeRecord, no sleep data)', () => {
    it('produces "poor" grade for days with no data at all', () => {
      // Simulates an older day where user did not open the app:
      // no WakeRecord, no bedtimeTarget, no sleep data
      const grade = buildGradeRecord('2026-02-20', undefined, null, null);
      expect(grade.grade).toBe('poor');
      expect(grade.morningPass).toBe(false);
      expect(grade.bedtimeResult).toBe('noData');
    });

    it('produces "poor" with bedtimeTarget but no sleep data', () => {
      // Older day with bedtime target set but no HealthKit data
      const grade = buildGradeRecord('2026-02-20', undefined, bedtimeTarget, null);
      expect(grade.grade).toBe('poor');
      expect(grade.bedtimeResult).toBe('noData');
      expect(grade.bedtimeTarget).toBe('23:00');
    });
  });
});
