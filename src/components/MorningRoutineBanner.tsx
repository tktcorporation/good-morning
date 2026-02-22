import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../constants/theme';
import { useMorningSessionStore } from '../stores/morning-session-store';

export function MorningRoutineBanner() {
  const { t } = useTranslation('dashboard');
  const router = useRouter();
  const session = useMorningSessionStore((s) => s.session);
  const getProgress = useMorningSessionStore((s) => s.getProgress);

  if (session === null) return null;

  const { completed, total } = getProgress();
  const progress = total > 0 ? completed / total : 0;

  return (
    <Pressable style={styles.container} onPress={() => router.navigate('/')}>
      <View style={styles.content}>
        <Text style={styles.text}>{t('morningRoutine.banner', { completed, total })}</Text>
      </View>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  text: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.success,
    borderRadius: borderRadius.full,
  },
});
