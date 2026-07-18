/**
 * AlarmKit サービス・スケジューラーのテスト。
 *
 * Effect 版のサービス（AlarmKitService, AlarmSchedulerService, compat.ts）を
 * runEffect() 経由でテストする。expo-alarm-kit は jest.setup.js でグローバルモック済み。
 */
import * as AlarmKit from 'expo-alarm-kit';
import {
  cancelAlarmsByIds,
  cancelAllAlarms,
  checkLaunchPayload,
  initializeAlarmKit,
  runEffect,
  SNOOZE_DURATION_SECONDS,
  SNOOZE_MAX_COUNT,
  scheduleSnoozeAlarms,
  scheduleWakeTargetAlarm,
} from '../services';
import type { WakeTarget } from '../types/wake-target';
import { DEFAULT_WAKE_TARGET } from '../types/wake-target';

const mockConfigure = AlarmKit.configure as jest.Mock;
const mockRequestAuthorization = AlarmKit.requestAuthorization as jest.Mock;
const mockScheduleRepeatingAlarm = AlarmKit.scheduleRepeatingAlarm as jest.Mock;
const mockScheduleAlarm = AlarmKit.scheduleAlarm as jest.Mock;
const mockCancelAlarm = AlarmKit.cancelAlarm as jest.Mock;
const mockGetAllAlarms = AlarmKit.getAllAlarms as jest.Mock;
const mockGenerateUUID = AlarmKit.generateUUID as jest.Mock;
const mockGetLaunchPayload = AlarmKit.getLaunchPayload as jest.Mock;

describe('alarm-kit service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfigure.mockReturnValue(true);
    mockRequestAuthorization.mockResolvedValue('authorized');
    mockScheduleRepeatingAlarm.mockResolvedValue(true);
    mockScheduleAlarm.mockResolvedValue(true);
    mockCancelAlarm.mockResolvedValue(true);
    mockGetAllAlarms.mockReturnValue([]);
    mockGenerateUUID.mockReturnValue('test-uuid-1');
    mockGetLaunchPayload.mockReturnValue(null);
  });

  describe('initializeAlarmKit', () => {
    test('calls configure with app group and requests authorization', async () => {
      const result = await initializeAlarmKit();
      expect(mockConfigure).toHaveBeenCalledWith('group.com.tktcorporation.goodmorning');
      expect(mockRequestAuthorization).toHaveBeenCalled();
      expect(result).toBe('authorized');
    });

    test('returns denied when configure fails', async () => {
      mockConfigure.mockReturnValueOnce(false);
      const result = await initializeAlarmKit();
      expect(result).toBe('denied');
      expect(mockRequestAuthorization).not.toHaveBeenCalled();
    });
  });

  describe('scheduleWakeTargetAlarm', () => {
    test('cancels all existing alarms before scheduling (孤立アラーム蓄積防止)', async () => {
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);
      mockGetAllAlarms.mockReturnValue(['stale-1', 'stale-2']);

      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        defaultTime: { hour: 7, minute: 30 },
        enabled: true,
      };

      const ids = await runEffect(scheduleWakeTargetAlarm(target, [], []));

      expect(mockGetAllAlarms).toHaveBeenCalled();
      expect(mockCancelAlarm).toHaveBeenCalledWith('stale-1');
      expect(mockCancelAlarm).toHaveBeenCalledWith('stale-2');
      expect(mockScheduleRepeatingAlarm).toHaveBeenCalledTimes(1);
      expect(mockScheduleRepeatingAlarm).toHaveBeenCalledWith(
        expect.objectContaining({
          hour: 7,
          minute: 30,
          weekdays: [1, 2, 3, 4, 5, 6, 7],
          launchAppOnDismiss: true,
        }),
      );
      const callArgs = mockScheduleRepeatingAlarm.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(callArgs?.doSnoozeIntent).toBeUndefined();
      expect(ids.length).toBe(1);
    });

    test('skips days that are set to off', async () => {
      mockGetAllAlarms.mockReturnValue([]);
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);

      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        defaultTime: { hour: 7, minute: 0 },
        dayOverrides: {
          0: { type: 'off' },
          6: { type: 'off' },
        },
        enabled: true,
      };

      await runEffect(scheduleWakeTargetAlarm(target, [], []));

      expect(mockScheduleRepeatingAlarm).toHaveBeenCalledTimes(1);
      expect(mockScheduleRepeatingAlarm).toHaveBeenCalledWith(
        expect.objectContaining({
          weekdays: [2, 3, 4, 5, 6],
        }),
      );
    });

    test('groups days by time and schedules separate alarms for different times', async () => {
      mockGetAllAlarms.mockReturnValue([]);
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);

      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        defaultTime: { hour: 7, minute: 0 },
        dayOverrides: {
          6: { type: 'custom', time: { hour: 8, minute: 30 } },
        },
        enabled: true,
      };

      await runEffect(scheduleWakeTargetAlarm(target, [], []));

      expect(mockScheduleRepeatingAlarm).toHaveBeenCalledTimes(2);
    });

    test('schedules one-time alarm for nextOverride', async () => {
      mockGetAllAlarms.mockReturnValue([]);
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);

      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        nextOverride: { time: { hour: 6, minute: 0 }, targetDate: '2099-12-31' },
        enabled: true,
      };

      await runEffect(scheduleWakeTargetAlarm(target, [], []));

      expect(mockScheduleAlarm).toHaveBeenCalledTimes(1);
      expect(mockScheduleAlarm).toHaveBeenCalledWith(
        expect.objectContaining({
          launchAppOnDismiss: true,
        }),
      );
    });

    test('returns empty array when target is disabled', async () => {
      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        enabled: false,
      };

      const ids = await runEffect(scheduleWakeTargetAlarm(target, [], []));
      expect(ids).toEqual([]);
      expect(mockScheduleRepeatingAlarm).not.toHaveBeenCalled();
    });

    test('スケジュール失敗（reject）時は旧アラームをキャンセルせず温存する', async () => {
      // 「先キャンセル→後スケジュール」だと、ネイティブの一時的な失敗 1 回で
      // アラームが 0 本になり翌朝何も鳴らなくなる。失敗時は旧アラームが残ること。
      mockGetAllAlarms.mockReturnValue(['old-1']);
      mockScheduleRepeatingAlarm.mockRejectedValue(new Error('native failure'));

      const target: WakeTarget = { ...DEFAULT_WAKE_TARGET, enabled: true };

      await expect(runEffect(scheduleWakeTargetAlarm(target, ['old-1'], []))).rejects.toBeDefined();
      expect(mockCancelAlarm).not.toHaveBeenCalledWith('old-1');
    });

    test('スケジュールが false を返したら失敗として扱い、部分登録をロールバックする', async () => {
      // success=false を黙って握ると、その曜日グループだけ静かに鳴らなくなる
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);
      mockGetAllAlarms.mockReturnValue(['old-1']);
      mockScheduleRepeatingAlarm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        defaultTime: { hour: 7, minute: 0 },
        dayOverrides: { 6: { type: 'custom', time: { hour: 8, minute: 30 } } },
        enabled: true,
      };

      await expect(runEffect(scheduleWakeTargetAlarm(target, ['old-1'], []))).rejects.toBeDefined();
      // 登録済みの新規分はロールバックされる
      expect(mockCancelAlarm).toHaveBeenCalledWith('uuid-1');
      // 旧アラームは温存される
      expect(mockCancelAlarm).not.toHaveBeenCalledWith('old-1');
    });

    test('登録成功後の孤立掃除は新規登録分とスヌーズを温存する', async () => {
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);
      // ネイティブ台帳に新規登録分が既に現れているケース（実機の getAllAlarms 相当）
      mockGetAllAlarms.mockReturnValue(['old-1', 'stale-x', 'snooze-1', 'uuid-1']);

      const target: WakeTarget = { ...DEFAULT_WAKE_TARGET, enabled: true };

      const ids = await runEffect(scheduleWakeTargetAlarm(target, ['old-1'], ['snooze-1']));

      expect(ids).toEqual(['uuid-1']);
      expect(mockCancelAlarm).toHaveBeenCalledWith('old-1');
      expect(mockCancelAlarm).toHaveBeenCalledWith('stale-x');
      expect(mockCancelAlarm).not.toHaveBeenCalledWith('snooze-1');
      expect(mockCancelAlarm).not.toHaveBeenCalledWith('uuid-1');
    });

    test('登録成功後の掃除（旧アラームキャンセル）が失敗しても新規登録分は返す', async () => {
      // 掃除フェーズの失敗で Effect ごと失敗させると、新アラームは登録済みなのに
      // 呼び出し元が setAlarmIds を呼ばず store が旧 ID のまま固定化する
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);
      mockGetAllAlarms.mockReturnValue(['old-1', 'uuid-1']);
      mockCancelAlarm.mockRejectedValue(new Error('cancel failed'));

      const target: WakeTarget = { ...DEFAULT_WAKE_TARGET, enabled: true };

      const ids = await runEffect(scheduleWakeTargetAlarm(target, ['old-1'], []));

      expect(ids).toEqual(['uuid-1']);
    });

    test('nextOverride のワンショットは保存済み targetDate の日に登録される', async () => {
      // now から再計算すると「明日だけ 8:00」を朝 7:30 に設定した場合に
      // 当日 8:00 へ載ってしまい、肝心の翌日に鳴らない
      jest.useFakeTimers({ now: new Date('2026-02-25T07:30:00') });
      try {
        let uuidCounter = 0;
        mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);

        const target: WakeTarget = {
          ...DEFAULT_WAKE_TARGET,
          nextOverride: { time: { hour: 8, minute: 0 }, targetDate: '2026-02-26' },
          enabled: true,
        };

        await runEffect(scheduleWakeTargetAlarm(target, [], []));

        const expectedEpoch = Math.floor(new Date('2026-02-26T08:00:00').getTime() / 1000);
        expect(mockScheduleAlarm).toHaveBeenCalledTimes(1);
        expect(mockScheduleAlarm).toHaveBeenCalledWith(
          expect.objectContaining({ epochSeconds: expectedEpoch }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    test('期限切れの nextOverride はワンショットを登録しない', async () => {
      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        nextOverride: { time: { hour: 6, minute: 0 }, targetDate: '2020-01-01' },
        enabled: true,
      };

      await runEffect(scheduleWakeTargetAlarm(target, [], []));
      expect(mockScheduleAlarm).not.toHaveBeenCalled();
    });

    test('nextOverride のワンショット登録が false なら全体を失敗とし、新規登録分をロールバックして旧アラームを温存する', async () => {
      // 半端な新旧混在スケジュールを残さない「全か無か」を保証する。
      // 失敗時はネイティブ状態を変えない（旧アラームがそのまま鳴る）のが安全側。
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `uuid-${++uuidCounter}`);
      mockGetAllAlarms.mockReturnValue(['old-1']);
      mockScheduleAlarm.mockResolvedValue(false);

      const target: WakeTarget = {
        ...DEFAULT_WAKE_TARGET,
        nextOverride: { time: { hour: 6, minute: 0 }, targetDate: '2099-12-31' },
        enabled: true,
      };

      await expect(runEffect(scheduleWakeTargetAlarm(target, ['old-1'], []))).rejects.toBeDefined();
      // 繰り返しアラーム（uuid-1）はロールバックでキャンセルされ、旧アラームは残る
      expect(mockCancelAlarm).toHaveBeenCalledWith('uuid-1');
      expect(mockCancelAlarm).not.toHaveBeenCalledWith('old-1');
    });
  });

  describe('cancelAllAlarms', () => {
    test('cancels all active alarms', async () => {
      mockGetAllAlarms.mockReturnValue(['alarm-1', 'alarm-2']);
      await runEffect(cancelAllAlarms);
      expect(mockCancelAlarm).toHaveBeenCalledWith('alarm-1');
      expect(mockCancelAlarm).toHaveBeenCalledWith('alarm-2');
    });
  });

  describe('cancelAlarmsByIds', () => {
    test('cancels only the specified alarm IDs', async () => {
      await runEffect(cancelAlarmsByIds(['snooze-1', 'snooze-2']));
      expect(mockCancelAlarm).toHaveBeenCalledWith('snooze-1');
      expect(mockCancelAlarm).toHaveBeenCalledWith('snooze-2');
      expect(mockCancelAlarm).toHaveBeenCalledTimes(2);
    });

    test('does nothing when given an empty array', async () => {
      await runEffect(cancelAlarmsByIds([]));
      expect(mockCancelAlarm).not.toHaveBeenCalled();
    });
  });

  describe('checkLaunchPayload', () => {
    test('returns null when no payload', () => {
      mockGetLaunchPayload.mockReturnValue(null);
      expect(checkLaunchPayload()).toBeNull();
    });

    test('returns payload when launched from alarm', () => {
      mockGetLaunchPayload.mockReturnValue({ alarmId: 'abc', payload: null });
      expect(checkLaunchPayload()).toEqual({ alarmId: 'abc', payload: null });
    });
  });

  describe('SNOOZE_DURATION_SECONDS', () => {
    test('is 540 seconds (9 minutes)', () => {
      expect(SNOOZE_DURATION_SECONDS).toBe(540);
    });
  });

  describe('SNOOZE_MAX_COUNT', () => {
    test('is 20 (9min × 20 = 3 hours)', () => {
      expect(SNOOZE_MAX_COUNT).toBe(20);
    });
  });

  describe('scheduleSnoozeAlarms', () => {
    test('schedules N alarms at 9-minute intervals with snooze payload', async () => {
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `snooze-uuid-${++uuidCounter}`);
      mockScheduleAlarm.mockResolvedValue(true);

      // 過去時刻のスヌーズは登録されないため、基準は現在時刻以降にする
      const baseTime = new Date(Date.now() + 60 * 1000);
      const ids = await runEffect(scheduleSnoozeAlarms(baseTime, 3));

      expect(ids).toHaveLength(3);
      expect(mockScheduleAlarm).toHaveBeenCalledTimes(3);
      for (let i = 0; i < 3; i++) {
        const expectedEpoch = Math.floor(
          (baseTime.getTime() + SNOOZE_DURATION_SECONDS * 1000 * (i + 1)) / 1000,
        );
        expect(mockScheduleAlarm).toHaveBeenCalledWith(
          expect.objectContaining({
            id: `snooze-uuid-${i + 1}`,
            epochSeconds: expectedEpoch,
            title: 'Good Morning',
            launchAppOnDismiss: true,
            dismissPayload: '{"isSnooze":true}',
          }),
        );
      }
    });

    test('returns empty array when count is 0', async () => {
      const ids = await runEffect(scheduleSnoozeAlarms(new Date(), 0));
      expect(ids).toHaveLength(0);
    });

    test('skips failed schedules and continues with remaining', async () => {
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `snooze-uuid-${++uuidCounter}`);
      mockScheduleAlarm
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const ids = await runEffect(scheduleSnoozeAlarms(new Date(), 3));
      expect(ids).toHaveLength(2);
      expect(ids).toEqual(['snooze-uuid-1', 'snooze-uuid-3']);
    });

    test('defaults to SNOOZE_MAX_COUNT alarms', async () => {
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `snooze-uuid-${++uuidCounter}`);
      mockScheduleAlarm.mockResolvedValue(true);

      const ids = await runEffect(scheduleSnoozeAlarms(new Date()));
      expect(ids).toHaveLength(SNOOZE_MAX_COUNT);
      expect(mockScheduleAlarm).toHaveBeenCalledTimes(SNOOZE_MAX_COUNT);
    });

    test('過去時刻になるスヌーズはスケジュールせず、未来分だけ登録する', async () => {
      // 遅延リカバリ（dismiss の数十分後にアプリを開いた等）で、
      // 既に過ぎた時刻のスヌーズをネイティブに渡さない
      let uuidCounter = 0;
      mockGenerateUUID.mockImplementation(() => `snooze-uuid-${++uuidCounter}`);
      mockScheduleAlarm.mockResolvedValue(true);

      // 30 分前が基準 → +9/+18/+27 分は過去、+36/+45 分は未来
      const baseTime = new Date(Date.now() - 30 * 60 * 1000);
      const ids = await runEffect(scheduleSnoozeAlarms(baseTime, 5));

      expect(mockScheduleAlarm).toHaveBeenCalledTimes(2);
      expect(ids).toHaveLength(2);
      const calledEpochs = mockScheduleAlarm.mock.calls.map(
        (c) => (c[0] as { epochSeconds: number }).epochSeconds,
      );
      for (const epoch of calledEpochs) {
        expect(epoch * 1000).toBeGreaterThan(Date.now() - 1000);
      }
    });
  });
});
