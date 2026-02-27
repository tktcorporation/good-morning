import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
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

  /**
   * 各権限の現在の状態を管理する。
   * APP_PERMISSIONS の id をキーとして、PermissionStatus を保持。
   * 初期値は 'pending' で、マウント時に各権限の request() を呼ばず
   * ステータスだけを確認する方法がないため、pending のまま開始し
   * ユーザーが許可操作をしたら granted/denied に更新する。
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
   */
  const handlePermissionRequest = useCallback(
    async (perm: PermissionItem) => {
      if (permissionStatuses[perm.id] === 'granted') return;

      const success = await perm.request();
      if (success) {
        setPermissionStatuses((prev) => ({ ...prev, [perm.id]: 'granted' }));
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
    [permissionStatuses, t],
  );

  /**
   * 就寝目標時刻のプリセット候補。
   * 一般的な就寝時間帯（22:00〜0:30）を30分刻みで用意し、
   * 最後に null（クリア）を含める。Pressable のタップでサイクルする。
   */
  const BEDTIME_PRESETS = useMemo(
    () =>
      [
        { hour: 22, minute: 0 },
        { hour: 22, minute: 30 },
        { hour: 23, minute: 0 },
        { hour: 23, minute: 30 },
        { hour: 0, minute: 0 },
        { hour: 0, minute: 30 },
        null,
      ] as const,
    [],
  );

  /**
   * 就寝目標時刻のサイクル切り替えハンドラ。
   * 現在の値が BEDTIME_PRESETS 内に見つかれば次の候補に進む。
   * 見つからなければ先頭（22:00）に戻る。シンプルなUXのためピッカーではなくサイクル方式を採用。
   */
  const handleBedtimeCycle = useCallback(async () => {
    const current = target?.bedtimeTarget ?? null;
    const currentIndex = BEDTIME_PRESETS.findIndex((preset) => {
      if (preset === null && current === null) return true;
      if (preset === null || current === null) return false;
      return preset.hour === current.hour && preset.minute === current.minute;
    });
    const nextIndex = (currentIndex + 1) % BEDTIME_PRESETS.length;
    const next = BEDTIME_PRESETS[nextIndex];
    await setBedtimeTarget(next ?? null);
  }, [target?.bedtimeTarget, setBedtimeTarget, BEDTIME_PRESETS]);

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

      {/* Bedtime Target — 就寝目標時刻。Daily Grade で ◎ excellent を狙うために必要 */}
      <View style={commonStyles.section}>
        <Text style={commonStyles.sectionTitle}>{t('settings.bedtimeTarget')}</Text>
        <Pressable style={styles.row} onPress={handleBedtimeCycle}>
          <View>
            <Text style={styles.rowTitle}>{bedtimeDisplay}</Text>
            {target?.bedtimeTarget == null && (
              <Text style={styles.description}>{t('settings.bedtimeTargetDescription')}</Text>
            )}
          </View>
          {target?.bedtimeTarget != null && <Text style={styles.chevron}>{'>'}</Text>}
        </Pressable>
      </View>

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
