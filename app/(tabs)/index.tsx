import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { AlarmCard } from '../../src/components/AlarmCard';
import { borderRadius, colors, fontSize, spacing } from '../../src/constants/theme';
import { useAlarmStore } from '../../src/stores/alarm-store';
import type { Alarm } from '../../src/types/alarm';

export default function AlarmsScreen() {
  const { t } = useTranslation('alarm');
  const { t: tCommon } = useTranslation('common');
  const router = useRouter();
  const alarms = useAlarmStore((s) => s.alarms);
  const loaded = useAlarmStore((s) => s.loaded);
  const toggleAlarm = useAlarmStore((s) => s.toggleAlarm);

  const handlePress = useCallback(
    (id: string) => {
      router.push(`/alarm/${id}`);
    },
    [router],
  );

  const handleToggle = useCallback(
    (id: string) => {
      toggleAlarm(id);
    },
    [toggleAlarm],
  );

  const handleCreate = useCallback(() => {
    router.push('/alarm/create');
  }, [router]);

  const renderItem = useCallback(
    ({ item }: { item: Alarm }) => (
      <AlarmCard alarm={item} onPress={handlePress} onToggle={handleToggle} />
    ),
    [handlePress, handleToggle],
  );

  const keyExtractor = useCallback((item: Alarm) => item.id, []);

  if (!loaded) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>{tCommon('loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={alarms as Alarm[]}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>{t('noAlarms')}</Text>
            <Text style={styles.emptySubtitle}>{t('noAlarmsHint')}</Text>
          </View>
        }
      />
      <Pressable
        style={styles.fab}
        onPress={handleCreate}
        accessibilityRole="button"
        accessibilityLabel={t('createNewAlarm')}
      >
        <Text style={styles.fabText}>{'+'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    padding: spacing.md,
    flexGrow: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '300',
    marginTop: -2,
  },
});
