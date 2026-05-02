import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SquatChallengeItem } from '../src/components/SquatChallengeItem';
import { borderRadius, colors, commonStyles, fontSize, spacing } from '../src/constants/theme';
import type { SessionTodo } from '../src/types/morning-session';

/**
 * スクワット検出の動作確認画面。
 *
 * 背景: 端末・体格・センサー個体差で検出感度が変わるため、
 * アラーム本番（app/(tabs)/index.tsx の MorningRoutineSection）と
 * まったく同じコンポーネント (SquatChallengeItem) を使い、
 * 朝のフローを発火させずに検出挙動だけを確認できるようにする。
 *
 * 設定画面からモーダル遷移で開く。動作はアラームフローと同等で、
 * SessionTodo を完全にローカル state として持ち、永続化はしない。
 */
const REQUIRED_COUNT = 10;

function createInitialTodo(): SessionTodo {
  return {
    id: 'squat-check',
    title: 'Squat',
    completed: false,
    completedAt: null,
    type: 'squat',
    requiredCount: REQUIRED_COUNT,
    currentCount: 0,
  };
}

export default function SquatCheckScreen() {
  const { t } = useTranslation('common');
  const [todo, setTodo] = useState<SessionTodo>(createInitialTodo);

  const handleIncrement = useCallback((_id: string) => {
    setTodo((prev) => ({ ...prev, currentCount: (prev.currentCount ?? 0) + 1 }));
  }, []);

  const handleComplete = useCallback((_id: string) => {
    setTodo((prev) => ({
      ...prev,
      completed: true,
      completedAt: new Date().toISOString(),
    }));
  }, []);

  const handleReset = useCallback(() => {
    setTodo(createInitialTodo());
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={commonStyles.section}>
        <Text style={styles.description}>{t('squatCheck.description')}</Text>
      </View>

      <View style={commonStyles.section}>
        <SquatChallengeItem todo={todo} onIncrement={handleIncrement} onComplete={handleComplete} />
      </View>

      <Pressable style={styles.resetButton} onPress={handleReset}>
        <Text style={styles.resetButtonText}>{t('squatCheck.reset')}</Text>
      </Pressable>
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
  description: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  resetButton: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  resetButtonText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
