import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { ALARM_SOUNDS } from '../../src/constants/alarm-sounds';
import {
  borderRadius,
  colors,
  commonStyles,
  fontSize,
  semanticColors,
  spacing,
} from '../../src/constants/theme';
import { playAlarmSound, stopAlarmSound } from '../../src/services/sound';
import { useSettingsStore } from '../../src/stores/settings-store';
import { useWakeTargetStore } from '../../src/stores/wake-target-store';

export default function SettingsScreen() {
  const { t } = useTranslation('common');
  const { t: tDash } = useTranslation('dashboard');
  const router = useRouter();

  const target = useWakeTargetStore((s) => s.target);
  const toggleEnabled = useWakeTargetStore((s) => s.toggleEnabled);
  const soundId = target?.soundId ?? 'default';
  const setSoundId = useWakeTargetStore((s) => s.setSoundId);
  const dayBoundaryHour = useSettingsStore((s) => s.dayBoundaryHour);
  const setDayBoundaryHour = useSettingsStore((s) => s.setDayBoundaryHour);
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  const [notificationStatus, setNotificationStatus] = useState<string | null>(null);

  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => {
      setNotificationStatus(status);
    });
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleToggleEnabled = useCallback(async () => {
    await toggleEnabled();
  }, [toggleEnabled]);

  const handleSoundSelect = useCallback(
    async (id: string) => {
      await setSoundId(id);
      await stopAlarmSound();
      await playAlarmSound(id);
      // Stop preview after 3 seconds
      setTimeout(() => {
        stopAlarmSound();
      }, 3000);
    },
    [setSoundId],
  );

  const handleDayBoundaryChange = useCallback(
    async (hour: number) => {
      await setDayBoundaryHour(hour);
    },
    [setDayBoundaryHour],
  );

  const isEnabled = target?.enabled ?? false;

  return (
    <View style={styles.container}>
      {/* Schedule */}
      <View style={commonStyles.section}>
        <Pressable style={styles.row} onPress={() => router.push('/schedule')}>
          <View>
            <Text style={styles.rowTitle}>{t('settings.schedule')}</Text>
            <Text style={styles.rowSubtitle}>{t('schedule.subtitle')}</Text>
          </View>
          <Text style={styles.chevron}>{'>'}</Text>
        </Pressable>
      </View>

      {/* Alarm Toggle */}
      <View style={commonStyles.section}>
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

      {/* Alarm Sound Selection */}
      <View style={commonStyles.section}>
        <Text style={commonStyles.sectionTitle}>{t('settings.alarmSound')}</Text>
        {ALARM_SOUNDS.map((sound) => (
          <Pressable
            key={sound.id}
            style={[styles.soundRow, sound.id === soundId && styles.soundRowSelected]}
            onPress={() => handleSoundSelect(sound.id)}
          >
            <Text
              style={[styles.soundRowText, sound.id === soundId && styles.soundRowTextSelected]}
            >
              {t(sound.nameKey as 'alarmSounds.default')}
            </Text>
            {sound.id === soundId && <Text style={styles.checkmark}>{'✓'}</Text>}
          </Pressable>
        ))}
      </View>

      {/* Day Boundary */}
      <View style={commonStyles.section}>
        <Text style={commonStyles.sectionTitle}>{t('settings.dayBoundary')}</Text>
        <Text style={styles.description}>{t('settings.dayBoundaryDescription')}</Text>
        <View style={styles.dayBoundaryRow}>
          {[0, 1, 2, 3, 4, 5, 6].map((hour) => (
            <Pressable
              key={hour}
              style={[
                styles.dayBoundaryOption,
                hour === dayBoundaryHour && styles.dayBoundaryOptionSelected,
              ]}
              onPress={() => handleDayBoundaryChange(hour)}
            >
              <Text
                style={[
                  styles.dayBoundaryText,
                  hour === dayBoundaryHour && styles.dayBoundaryTextSelected,
                ]}
              >
                {t('settings.dayBoundaryHour', { hour })}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Notification Status */}
      <View style={commonStyles.section}>
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
      <View style={commonStyles.section}>
        <Text style={commonStyles.sectionTitle}>{t('settings.about')}</Text>
        <Text style={styles.text}>
          {t('settings.version', { version: Constants.expoConfig?.version ?? '0.0.0' })}
        </Text>
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
  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.xs,
  },
  soundRowSelected: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  soundRowText: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  soundRowTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  checkmark: {
    color: colors.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  dayBoundaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  dayBoundaryOption: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dayBoundaryOptionSelected: {
    backgroundColor: colors.primary,
  },
  dayBoundaryText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  dayBoundaryTextSelected: {
    color: colors.text,
    fontWeight: '600',
  },
});
