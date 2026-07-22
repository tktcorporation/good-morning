import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { DayBoundaryPicker } from '../../src/components/DayBoundaryPicker';
import { APP_PERMISSIONS, type PermissionItem } from '../../src/constants/permissions';
import {
  borderRadius,
  colors,
  commonStyles,
  fontSize,
  semanticColors,
  spacing,
} from '../../src/constants/theme';
import { useSettingsStore } from '../../src/stores/settings-store';
import { useWakeTargetStore } from '../../src/stores/wake-target-store';
import type { WakeTaskType } from '../../src/types/wake-target';

/**
 * 権限の許可状態を settings-store の値から純粋に導出する。
 * APP_PERMISSIONS の id と settings-store の各 granted フィールドが1対1で対応する。
 */
function resolvePermissionGranted(
  id: string,
  alarmKitGranted: boolean,
  healthKitEnabled: boolean,
): boolean {
  return id === 'alarmKit' ? alarmKitGranted : healthKitEnabled;
}

export default function SettingsScreen() {
  const { t } = useTranslation('common');
  const { t: tDash } = useTranslation('dashboard');
  const router = useRouter();

  const target = useWakeTargetStore((s) => s.target);
  const toggleEnabled = useWakeTargetStore((s) => s.toggleEnabled);
  const setTaskType = useWakeTargetStore((s) => s.setTaskType);
  const dayBoundaryHour = useSettingsStore((s) => s.dayBoundaryHour);
  const setDayBoundaryHour = useSettingsStore((s) => s.setDayBoundaryHour);
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  const healthKitEnabled = useSettingsStore((s) => s.healthKitEnabled);
  const alarmKitGranted = useSettingsStore((s) => s.alarmKitGranted);
  const setAlarmKitGranted = useSettingsStore((s) => s.setAlarmKitGranted);
  const setHealthKitEnabled = useSettingsStore((s) => s.setHealthKitEnabled);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleToggleEnabled = useCallback(async () => {
    await toggleEnabled();
  }, [toggleEnabled]);

  const handleDayBoundaryChange = useCallback(
    async (hour: number) => {
      await setDayBoundaryHour(hour);
    },
    [setDayBoundaryHour],
  );

  const taskType = target?.taskType ?? 'squat';
  const handleTaskTypeChange = useCallback(
    async (type: WakeTaskType) => {
      if (type === taskType) return;
      await setTaskType(type);
    },
    [taskType, setTaskType],
  );

  /**
   * 権限リクエストのハンドラ。
   * すでに granted な権限はタップしても何もしない。
   * request() が false を返した場合はiOS設定アプリへの誘導を表示する。
   * 成功時は store に永続化して、次回起動時にも権限状態を復元できるようにする。
   */
  const handlePermissionRequest = useCallback(
    async (perm: PermissionItem) => {
      if (resolvePermissionGranted(perm.id, alarmKitGranted, healthKitEnabled)) return;

      const success = await perm.request();
      if (success) {
        if (perm.id === 'alarmKit') {
          await setAlarmKitGranted(true);
        } else {
          await setHealthKitEnabled(true);
        }
      } else {
        Alert.alert(
          t(`settings.permissionItems.${perm.i18nKey}.name`),
          t('settings.permissionRequestFailed'),
        );
      }
    },
    [alarmKitGranted, healthKitEnabled, t, setAlarmKitGranted, setHealthKitEnabled],
  );

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

      {/* Day Boundary */}
      <View style={commonStyles.section}>
        <Text style={commonStyles.sectionTitle}>{t('settings.dayBoundary')}</Text>
        <DayBoundaryPicker value={dayBoundaryHour} onValueChange={handleDayBoundaryChange} />
      </View>

      {/* Task Type - 起床タスクの種類（スクワット / 空の写真）を選択 */}
      <View style={commonStyles.section}>
        <Text style={commonStyles.sectionTitle}>{t('settings.taskType')}</Text>
        <View style={styles.taskTypeRow}>
          <Pressable
            style={[styles.taskTypeOption, taskType === 'squat' && styles.taskTypeOptionSelected]}
            onPress={() => handleTaskTypeChange('squat')}
          >
            <Text
              style={[
                styles.taskTypeOptionText,
                taskType === 'squat' && styles.taskTypeOptionTextSelected,
              ]}
            >
              {t('settings.taskTypeSquat')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.taskTypeOption, taskType === 'sky' && styles.taskTypeOptionSelected]}
            onPress={() => handleTaskTypeChange('sky')}
          >
            <Text
              style={[
                styles.taskTypeOptionText,
                taskType === 'sky' && styles.taskTypeOptionTextSelected,
              ]}
            >
              {t('settings.taskTypeSky')}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Squat Check - 朝のスクワット検出を本番フロー外で確認するための動作確認モード */}
      <View style={commonStyles.section}>
        <Pressable style={styles.row} onPress={() => router.push('/squat-check')}>
          <View>
            <Text style={styles.rowTitle}>{t('settings.squatCheck')}</Text>
            <Text style={styles.rowSubtitle}>{t('settings.squatCheckSubtitle')}</Text>
          </View>
          <Text style={styles.chevron}>{'>'}</Text>
        </Pressable>
      </View>

      {/* Permissions - 通知やヘルスケアなど、アプリが必要とするOS権限を一覧表示 */}
      <View style={commonStyles.section}>
        <Text style={commonStyles.sectionTitle}>{t('settings.permissions')}</Text>
        {APP_PERMISSIONS.map((perm) => {
          const isGranted = resolvePermissionGranted(perm.id, alarmKitGranted, healthKitEnabled);
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
                  {t(`settings.permissionItems.${perm.i18nKey}.name`)}
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
  taskTypeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  taskTypeOption: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  taskTypeOptionSelected: {
    borderColor: colors.primary,
  },
  taskTypeOptionText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  taskTypeOptionTextSelected: {
    color: colors.text,
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
});
