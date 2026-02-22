import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { borderRadius, colors, fontSize, semanticColors, spacing } from '../../src/constants/theme';
import { useWakeTargetStore } from '../../src/stores/wake-target-store';

export default function SettingsScreen() {
  const { t } = useTranslation('common');
  const { t: tDash } = useTranslation('dashboard');
  const router = useRouter();

  const target = useWakeTargetStore((s) => s.target);
  const toggleEnabled = useWakeTargetStore((s) => s.toggleEnabled);

  const [notificationStatus, setNotificationStatus] = useState<string | null>(null);

  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => {
      setNotificationStatus(status);
    });
  }, []);

  const handleToggleEnabled = useCallback(async () => {
    await toggleEnabled();
  }, [toggleEnabled]);

  const isEnabled = target?.enabled ?? false;

  return (
    <View style={styles.container}>
      {/* Schedule */}
      <View style={styles.section}>
        <Pressable style={styles.row} onPress={() => router.push('/schedule')}>
          <View>
            <Text style={styles.rowTitle}>{t('settings.schedule')}</Text>
            <Text style={styles.rowSubtitle}>{t('schedule.subtitle')}</Text>
          </View>
          <Text style={styles.chevron}>{'>'}</Text>
        </Pressable>
      </View>

      {/* Alarm Toggle */}
      <View style={styles.section}>
        <View style={styles.row}>
          <Text style={styles.rowTitle}>{isEnabled ? tDash('enabled') : tDash('disabled')}</Text>
          <Switch
            value={isEnabled}
            onValueChange={handleToggleEnabled}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.text}
          />
        </View>
      </View>

      {/* Notification Status */}
      <View style={styles.section}>
        <View style={styles.row}>
          <Text style={styles.rowTitle}>{t('settings.notifications')}</Text>
          <Text
            style={[
              styles.statusBadge,
              notificationStatus === 'granted' ? styles.statusGranted : styles.statusDenied,
            ]}
          >
            {notificationStatus === 'granted'
              ? t('settings.notificationsGranted')
              : t('settings.notificationsDenied')}
          </Text>
        </View>
      </View>

      {/* About */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.about')}</Text>
        <Text style={styles.text}>{t('settings.version', { version: Constants.expoConfig?.version ?? '0.0.0' })}</Text>
        <Text style={styles.description}>{t('settings.description')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  rowTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  rowSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  chevron: {
    fontSize: fontSize.lg,
    color: colors.textMuted,
  },
  statusBadge: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  statusGranted: {
    color: colors.success,
    backgroundColor: semanticColors.successLight,
  },
  statusDenied: {
    color: colors.warning,
    backgroundColor: semanticColors.warningLight,
  },
  text: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    lineHeight: 22,
  },
});
