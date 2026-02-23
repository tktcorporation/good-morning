import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') {
    return true;
  }
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function cancelAlarmNotifications(notificationIds: readonly string[]): Promise<void> {
  const cancellations = notificationIds.map((id) =>
    Notifications.cancelScheduledNotificationAsync(id),
  );
  await Promise.all(cancellations);
}

export function addNotificationResponseListener(
  callback: () => void,
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (data?.wakeTarget === true || typeof data?.alarmId === 'string') {
      callback();
    }
  });
}

export function addNotificationReceivedListener(
  callback: () => void,
): Notifications.EventSubscription {
  return Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data;
    if (data?.wakeTarget === true || typeof data?.alarmId === 'string') {
      callback();
    }
  });
}
