import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { BedtimePickerModal } from '../../src/components/BedtimePickerModal';
import { DayBoundarySlider } from '../../src/components/DayBoundarySlider';
import { ALARM_SOUNDS } from '../../src/constants/alarm-sounds';
import {
  APP_PERMISSIONS,
  type PermissionItem,
  type PermissionStatus,
} from '../../src/constants/permissions';
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
  const setBedtimeTarget = useWakeTargetStore((s) => s.setBedtimeTarget);
  const dayBoundaryHour = useSettingsStore((s) => s.dayBoundaryHour);
  const setDayBoundaryHour = useSettingsStore((s) => s.setDayBoundaryHour);
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  const healthKitEnabled = useSettingsStore((s) => s.healthKitEnabled);
  const alarmKitGranted = useSettingsStore((s) => s.alarmKitGranted);
  const setAlarmKitGranted = useSettingsStore((s) => s.setAlarmKitGranted);

  /**
   * 各権限の現在の状態を管理する。
   * APP_PERMISSIONS の id をキーとして、PermissionStatus を保持。
   * 初期値は 'pending' だが、loadSettings 完了後に AsyncStorage から
   * 復元した値で上書きされる（下の useEffect を参照）。
   */
  const [permissionStatuses, setPermissionStatuses] = useState<Record<string, PermissionStatus>>(
    () => {
      const initial: Record<string, PermissionStatus> = {};
      for (const perm of APP_PERMISSIONS) {
        initial[perm.id] = 'pending';
      }
      return initial;
    },
  );

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // healthKitEnabled / alarmKitGranted が AsyncStorage からロードされた後、
  // 権限ステータスに反映する。直接 useState の初期値では
  // loadSettings 完了前なので false のままになる。
  useEffect(() => {
    if (healthKitEnabled) {
      setPermissionStatuses((prev) => ({ ...prev, healthKit: 'granted' }));
    }
  }, [healthKitEnabled]);

  useEffect(() => {
    if (alarmKitGranted) {
      setPermissionStatuses((prev) => ({ ...prev, alarmKit: 'granted' }));
    }
  }, [alarmKitGranted]);

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

  /**
   * 権限リクエストのハンドラ。
   * すでに granted な権限はタップしても何もしない。
   * request() が false を返した場合はiOS設定アプリへの誘導を表示する。
   * 成功時は store に永続化して、次回起動時にも権限状態を復元できるようにする。
   */
  const handlePermissionRequest = useCallback(
    async (perm: PermissionItem) => {
      if (permissionStatuses[perm.id] === 'granted') return;

      const success = await perm.request();
      if (success) {
        setPermissionStatuses((prev) => ({ ...prev, [perm.id]: 'granted' }));
        // AlarmKit 権限の許可状態を永続化して、次回起動時に復元する
        if (perm.id === 'alarmKit') {
          await setAlarmKitGranted(true);
        }
      } else {
        setPermissionStatuses((prev) => ({ ...prev, [perm.id]: 'denied' }));
        Alert.alert(
          t(
            `settings.permissionItems.${perm.i18nKey}.name` as 'settings.permissionItems.alarmKit.name',
          ),
          t('settings.permissionRequestFailed'),
        );
      }
    },
    [permissionStatuses, t, setAlarmKitGranted],
  );

  const [bedtimeModalVisible, setBedtimeModalVisible] = useState(false);

  const handleBedtimeSave = useCallback(
    async (value: { hour: number; minute: number } | null) => {
      await setBedtimeTarget(value);
      setBedtimeModalVisible(false);
    },
    [setBedtimeTarget],
  );

  const bedtimeDisplay = useMemo(() => {
    const bt = target?.bedtimeTarget;
    if (bt == null) return t('settings.bedtimeNotSet');
    return `${String(bt.hour).padStart(2, '0')}:${String(bt.minute).padStart(2, '0')}`;
  }, [target?.bedtimeTarget, t]);

  const isEnabled = target?.enabled ?? false;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
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
        <DayBoundarySlider value={dayBoundaryHour} onValueChange={handleDayBoundaryChange} />
      </View>

      {/* Bedtime Target — 就寝目標時刻。Daily Grade で ◎ excellent を狙うために必要 */}
      <View style={commonStyles.section}>
        <Text style={commonStyles.sectionTitle}>{t('settings.bedtimeTarget')}</Text>
        <Pressable style={styles.row} onPress={() => setBedtimeModalVisible(true)}>
          <View>
            <Text style={styles.rowTitle}>{bedtimeDisplay}</Text>
            {target?.bedtimeTarget == null && (
              <Text style={styles.description}>{t('settings.bedtimeTargetDescription')}</Text>
            )}
          </View>
          <Text style={styles.chevron}>{'>'}</Text>
        </Pressable>
      </View>

      <BedtimePickerModal
        visible={bedtimeModalVisible}
        currentValue={target?.bedtimeTarget ?? null}
        onSave={handleBedtimeSave}
        onClose={() => setBedtimeModalVisible(false)}
      />

      {/* Permissions - 通知やヘルスケアなど、アプリが必要とするOS権限を一覧表示 */}
      <View style={commonStyles.section}>
        <Text style={commonStyles.sectionTitle}>{t('settings.permissions')}</Text>
        {APP_PERMISSIONS.map((perm) => {
          const status = permissionStatuses[perm.id];
          const isGranted = status === 'granted';
          return (
            <Pressable
              key={perm.id}
              style={styles.permissionRow}
              onPress={() => handlePermissionRequest(perm)}
              disabled={isGranted}
            >
              <View style={styles.permissionInfo}>
                <Text style={styles.permissionIcon}>{perm.icon}</Text>
                <Text style={styles.permissionName}>
                  {t(
                    `settings.permissionItems.${perm.i18nKey}.name` as 'settings.permissionItems.alarmKit.name',
                  )}
                </Text>
              </View>
              <Text
                style={[styles.statusBadge, isGranted ? styles.statusGranted : styles.statusDenied]}
              >
                {isGranted ? t('settings.permissionGranted') : t('settings.permissionDenied')}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* About */}
      <View style={commonStyles.section}>
        <Text style={commonStyles.sectionTitle}>{t('settings.about')}</Text>
        <Text style={styles.text}>
          {t('settings.version', { version: Constants.expoConfig?.version ?? '0.0.0' })}
        </Text>
        <Text style={styles.description}>{t('settings.description')}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
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
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.xs,
  },
  permissionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  permissionIcon: {
    fontSize: fontSize.lg,
  },
  permissionName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
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
});
