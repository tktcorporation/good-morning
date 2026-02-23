import * as Notifications from 'expo-notifications';
import { cancelAlarmNotifications } from '../services/notifications';

const mockCancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;

describe('notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('cancelAlarmNotifications', () => {
    test('cancels all given notification ids', async () => {
      const ids = ['id-1', 'id-2', 'id-3', 'id-4'];

      await cancelAlarmNotifications(ids);

      expect(mockCancel).toHaveBeenCalledTimes(4);
      expect(mockCancel).toHaveBeenCalledWith('id-1');
      expect(mockCancel).toHaveBeenCalledWith('id-2');
      expect(mockCancel).toHaveBeenCalledWith('id-3');
      expect(mockCancel).toHaveBeenCalledWith('id-4');
    });

    test('handles empty array', async () => {
      await cancelAlarmNotifications([]);

      expect(mockCancel).not.toHaveBeenCalled();
    });
  });
});
