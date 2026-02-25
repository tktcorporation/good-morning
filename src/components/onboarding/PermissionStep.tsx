import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  APP_PERMISSIONS,
  type PermissionItem,
  type PermissionStatus,
} from '../../constants/permissions';
import { borderRadius, colors, fontSize, spacing } from '../../constants/theme';
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

  const handleRequest = useCallback(async (permission: PermissionItem) => {
    const success = await permission.request();
    setStatuses((prev) => {
      const next = new Map(prev);
      next.set(permission.id, success ? 'granted' : 'denied');
      return next;
    });
  }, []);

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
        ? t('permission.denied')
        : t('permission.allow');

  const buttonStyle =
    status === 'granted'
      ? styles.btnGranted
      : status === 'denied'
        ? styles.btnDenied
        : styles.btnPending;

  const buttonTextStyle = status === 'granted' ? styles.btnTextGranted : styles.btnTextDefault;

  // i18nKey は permissions.ts で定義された固定文字列だが、型上は string なので
  // テンプレートリテラルでは i18next の型推論が効かない。as never でバイパスする。
  const nameKey = `permission.items.${permission.i18nKey}.name` as never;
  const descKey = `permission.items.${permission.i18nKey}.description` as never;

  return (
    <View style={styles.row}>
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
        onPress={() => onRequest(permission)}
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
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
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
    backgroundColor: 'rgba(46, 213, 115, 0.15)',
  },
  btnDenied: {
    backgroundColor: 'rgba(255, 165, 2, 0.15)',
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
