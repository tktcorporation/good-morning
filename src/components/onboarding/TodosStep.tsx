import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../../constants/theme';
import { StepButton } from './StepButton';

interface TodosStepProps {
  readonly onNext: () => void;
  readonly onBack: () => void;
  readonly todos: readonly string[];
  readonly setTodos: (todos: readonly string[]) => void;
}

const PRESET_KEYS = ['drinkWater', 'stretch', 'washFace'] as const;

export function TodosStep({ onNext, onBack, todos, setTodos }: TodosStepProps) {
  const { t } = useTranslation('onboarding');
  const [inputText, setInputText] = useState('');

  const handleAddTodo = () => {
    const trimmed = inputText.trim();
    if (trimmed === '') return;
    setTodos([...todos, trimmed]);
    setInputText('');
  };

  const handleRemoveTodo = (index: number) => {
    setTodos(todos.filter((_, i) => i !== index));
  };

  const handleAddPreset = (key: (typeof PRESET_KEYS)[number]) => {
    const label = t(`todos.presets.${key}`);
    if (!todos.includes(label)) {
      setTodos([...todos, label]);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('todos.title')}</Text>
        <Text style={styles.subtitle}>{t('todos.subtitle')}</Text>
      </View>

      <View style={styles.presets}>
        {PRESET_KEYS.map((key) => {
          const label = t(`todos.presets.${key}`);
          const isAdded = todos.includes(label);
          return (
            <Pressable
              key={key}
              style={[styles.chip, isAdded && styles.chipAdded]}
              onPress={() => handleAddPreset(key)}
              disabled={isAdded}
              accessibilityRole="button"
            >
              <Text style={[styles.chipText, isAdded && styles.chipTextAdded]}>
                {isAdded ? `+ ${label}` : `+ ${label}`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder={t('todos.placeholder')}
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={handleAddTodo}
          returnKeyType="done"
        />
        <Pressable style={styles.addButton} onPress={handleAddTodo} accessibilityRole="button">
          <Text style={styles.addButtonText}>{'+'}</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.todoList}>
        {todos.map((todo) => (
          <View key={todo} style={styles.todoItem}>
            <Text style={styles.todoText}>{todo}</Text>
            <Pressable
              style={styles.removeButton}
              onPress={() => handleRemoveTodo(todos.indexOf(todo))}
              accessibilityRole="button"
            >
              <Text style={styles.removeText}>{'x'}</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <View style={styles.buttons}>
        <StepButton label={t('back')} onPress={onBack} variant="secondary" flex={1} />
        <StepButton label={t('next')} onPress={onNext} variant="primary" flex={1} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipAdded: {
    backgroundColor: colors.surfaceLight,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  chipTextAdded: {
    color: colors.primary,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    color: colors.text,
    fontSize: fontSize.md,
  },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '600',
  },
  todoList: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  todoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  todoText: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
  },
  removeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    color: colors.primary,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
});
