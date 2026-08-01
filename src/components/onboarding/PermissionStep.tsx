import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppState,
  type AppStateStatus,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  APP_PERMISSIONS,
  type PermissionItem,
  type PermissionStatus,
} from '../../constants/permissions';
import {
  borderRadius,
  colors,
  commonStyles,
  fontSize,
  semanticColors,
  spacing,
} from '../../constants/theme';
import { useSettingsStore } from '../../stores/settings-store';
import { StepButton } from './StepButton';
import { StepHeader } from './StepHeader';

interface PermissionStepProps {
  readonly onNext: () => void;
  readonly onBack: () => void;
}

/**
 * オンボーディングの権限許可ステップ。
 *
 * APP_PERMISSIONS 配列に定義された全権限を一覧表示し、
 * 個別に許可を求める。required な権限が全て granted になるまで
 * 「次へ」ボタンは無効化される。
 */
export function PermissionStep({ onNext, onBack }: PermissionStepProps) {
  const { t } = useTranslation('onboarding');
  const [statuses, setStatuses] = useState<Map<string, PermissionStatus>>(
    () => new Map(APP_PERMISSIONS.map((p) => [p.id, 'pending'])),
  );
  const setAlarmKitGranted = useSettingsStore((s) => s.setAlarmKitGranted);
  const setHealthKitEnabled = useSettingsStore((s) => s.setHealthKitEnabled);

  const handleRequest = useCallback(
    async (permission: PermissionItem) => {
      const success = await permission.request();
      setStatuses((prev) => {
        const next = new Map(prev);
        next.set(permission.id, success ? 'granted' : 'denied');
        return next;
      });
      if (!success) return;
      // 設定画面の権限表示（AsyncStorage 永続化分）と食い違わないよう、
      // オンボーディングで許可した時点でも同じ store フラグに反映する。
      if (permission.id === 'alarmKit') {
        await setAlarmKitGranted(true);
      } else if (permission.id === 'healthKit') {
        await setHealthKitEnabled(true);
      }
    },
    [setAlarmKitGranted, setHealthKitEnabled],
  );

  const recheckAllDeniedPermissions = useCallback(() => {
    for (const permission of APP_PERMISSIONS) {
      if (statuses.get(permission.id) === 'denied') {
        void handleRequest(permission);
      }
    }
  }, [statuses, handleRequest]);

  // OS の権限ダイアログは一度 deny すると二度と出せない。Settings アプリで許可し直して
  // 戻ってきたケースを拾うため、バックグラウンド → フォアグラウンド復帰時に denied な
  // 権限だけを静かに再チェックする。pending はユーザーがまだ何もタップしていないので
  // 対象外にする — 対象にすると復帰のたびに OS 権限ダイアログが勝手に出てしまう。
  // 「一度でも background を経由したか」で判定する — 権限リクエスト自体が開く
  // システムダイアログは active→inactive→active としか遷移せず background を
  // 経由しないため、ダイアログの開閉だけでは誤って再発火しない。
  const wasBackgroundedRef = useRef(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background') {
        wasBackgroundedRef.current = true;
        return;
      }
      if (nextState !== 'active') return;
      const shouldRecheck = wasBackgroundedRef.current;
      wasBackgroundedRef.current = false;
      if (shouldRecheck) recheckAllDeniedPermissions();
    });
    return () => subscription.remove();
  }, [recheckAllDeniedPermissions]);

  // required な権限が全て granted であれば「次へ」を有効化
  const allRequiredGranted = APP_PERMISSIONS.filter((p) => p.required).every(
    (p) => statuses.get(p.id) === 'granted',
  );

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <StepHeader title={t('permission.title')} subtitle={t('permission.subtitle')} />
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {APP_PERMISSIONS.map((permission) => {
            const status = statuses.get(permission.id) ?? 'pending';
            return (
              <PermissionRow
                key={permission.id}
                permission={permission}
                status={status}
                onRequest={handleRequest}
              />
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.buttons}>
        <StepButton label={t('back')} onPress={onBack} variant="secondary" flex={1} />
        <StepButton
          label={t('next')}
          onPress={onNext}
          variant="primary"
          flex={2}
          disabled={!allRequiredGranted}
          style={!allRequiredGranted ? { opacity: 0.5 } : undefined}
        />
      </View>
    </View>
  );
}

// -- PermissionRow --

interface PermissionRowProps {
  readonly permission: PermissionItem;
  readonly status: PermissionStatus;
  readonly onRequest: (permission: PermissionItem) => void;
}

function PermissionRow({ permission, status, onRequest }: PermissionRowProps) {
  const { t } = useTranslation('onboarding');

  const buttonLabel =
    status === 'granted'
      ? t('permission.granted')
      : status === 'denied'
        ? t('permission.openSettings')
        : t('permission.allow');

  const buttonStyle =
    status === 'granted'
      ? styles.btnGranted
      : status === 'denied'
        ? styles.btnDenied
        : styles.btnPending;

  const buttonTextStyle = status === 'granted' ? styles.btnTextGranted : styles.btnTextDefault;

  const nameKey = `permission.items.${permission.i18nKey}.name` as const;
  const descKey = `permission.items.${permission.i18nKey}.description` as const;

  // iOS は一度 deny された権限のシステムダイアログを二度と出さないため、
  // request() の再実行は無意味。Settings アプリへ誘導して復帰時の
  // AppState リスナーで許可状態を拾い直す。
  const handlePress = () => {
    if (status === 'denied') {
      Linking.openSettings();
      return;
    }
    onRequest(permission);
  };

  return (
    <View style={[commonStyles.card, styles.row]}>
      <Text style={styles.icon}>{permission.icon}</Text>
      <View style={styles.rowInfo}>
        <View style={styles.rowNameLine}>
          <Text style={styles.rowName}>{t(nameKey)}</Text>
          {permission.required ? (
            <Text style={styles.requiredBadge}>{t('permission.required')}</Text>
          ) : (
            <Text style={styles.optionalBadge}>{t('permission.optional')}</Text>
          )}
        </View>
        <Text style={styles.rowDescription}>{t(descKey)}</Text>
      </View>
      <Pressable
        style={[styles.btn, buttonStyle]}
        onPress={handlePress}
        disabled={status === 'granted'}
        accessibilityRole="button"
      >
        <Text style={[styles.btnText, buttonTextStyle]}>{buttonLabel}</Text>
      </Pressable>
    </View>
  );
}

// -- Styles --

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: spacing.xl,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: spacing.md,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  icon: {
    fontSize: fontSize.xl,
  },
  rowInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  rowNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  rowDescription: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  requiredBadge: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  optionalBadge: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  // Button
  btn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    minWidth: 80,
  },
  btnPending: {
    backgroundColor: colors.primary,
  },
  btnGranted: {
    backgroundColor: semanticColors.successLight,
  },
  btnDenied: {
    backgroundColor: semanticColors.warningLight,
  },
  btnText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  btnTextDefault: {
    color: colors.text,
  },
  btnTextGranted: {
    color: colors.success,
  },
});
