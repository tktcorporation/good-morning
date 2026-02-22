import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { DaySelector } from '../../src/components/DaySelector';
import { TodoListItem } from '../../src/components/TodoListItem';
import { borderRadius, colors, fontSize, spacing } from '../../src/constants/theme';
import { useAlarmStore } from '../../src/stores/alarm-store';
import type { AlarmTime, DayOfWeek, TodoItem } from '../../src/types/alarm';
import { createTodoId } from '../../src/types/alarm';

export default function CreateAlarmScreen() {
  const { t } = useTranslation('alarm');
  const router = useRouter();
  const addAlarm = useAlarmStore((s) => s.addAlarm);

  const [hour, setHour] = useState(7);
  const [minute, setMinute] = useState(0);
  const [label, setLabel] = useState('');
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [repeatDays, setRepeatDays] = useState<DayOfWeek[]>([]);

  const handleTimeChange = useCallback((type: 'hour' | 'minute', delta: number) => {
    if (type === 'hour') {
      setHour((prev) => (prev + delta + 24) % 24);
    } else {
      setMinute((prev) => (prev + delta + 60) % 60);
    }
  }, []);

  const handleToggleDay = useCallback((day: DayOfWeek) => {
    setRepeatDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  }, []);

  const handleAddTodo = useCallback(() => {
    const newTodo: TodoItem = {
      id: createTodoId(),
      title: '',
      completed: false,
    };
    setTodos((prev) => [...prev, newTodo]);
  }, []);

  const handleTodoTitleChange = useCallback((id: string, title: string) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
  }, []);

  const handleDeleteTodo = useCallback((id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleSave = useCallback(async () => {
    const validTodos = todos.filter((t) => t.title.trim() !== '');
    if (validTodos.length === 0) {
      Alert.alert(t('addTasksTitle'), t('addTasksMessage'));
      return;
    }

    const time: AlarmTime = { hour, minute };
    await addAlarm({
      time,
      label: label.trim(),
      todos: validTodos,
      repeatDays,
    });
    router.back();
  }, [hour, minute, label, todos, repeatDays, addAlarm, router, t]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Time Picker */}
        <View style={styles.timePicker}>
          <View style={styles.timeColumn}>
            <Pressable style={styles.timeButton} onPress={() => handleTimeChange('hour', 1)}>
              <Text style={styles.timeButtonText}>{'▲'}</Text>
            </Pressable>
            <Text style={styles.timeDisplay}>{hour.toString().padStart(2, '0')}</Text>
            <Pressable style={styles.timeButton} onPress={() => handleTimeChange('hour', -1)}>
              <Text style={styles.timeButtonText}>{'▼'}</Text>
            </Pressable>
          </View>
          <Text style={styles.timeSeparator}>{':'}</Text>
          <View style={styles.timeColumn}>
            <Pressable style={styles.timeButton} onPress={() => handleTimeChange('minute', 1)}>
              <Text style={styles.timeButtonText}>{'▲'}</Text>
            </Pressable>
            <Text style={styles.timeDisplay}>{minute.toString().padStart(2, '0')}</Text>
            <Pressable style={styles.timeButton} onPress={() => handleTimeChange('minute', -1)}>
              <Text style={styles.timeButtonText}>{'▼'}</Text>
            </Pressable>
          </View>
        </View>

        {/* Label */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('label')}</Text>
          <TextInput
            style={styles.input}
            value={label}
            onChangeText={setLabel}
            placeholder={t('labelPlaceholder')}
            placeholderTextColor={colors.textMuted}
          />
        </View>

        {/* Repeat Days */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('repeat')}</Text>
          <DaySelector selectedDays={repeatDays} onToggle={handleToggleDay} />
        </View>

        {/* Todo Items */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('tasks')}</Text>
            <Pressable style={styles.addButton} onPress={handleAddTodo}>
              <Text style={styles.addButtonText}>{t('addTask')}</Text>
            </Pressable>
          </View>
          <Text style={styles.sectionDescription}>{t('tasksDescription')}</Text>
          {todos.map((todo) => (
            <TodoListItem
              key={todo.id}
              item={todo}
              onToggle={() => {}}
              editable
              onChangeTitle={handleTodoTitleChange}
              onDelete={handleDeleteTodo}
            />
          ))}
          {todos.length === 0 && <Text style={styles.emptyText}>{t('noTasksYet')}</Text>}
        </View>
      </ScrollView>

      {/* Save Button */}
      <Pressable style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>{t('saveAlarm')}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: spacing.md,
    paddingBottom: 100,
  },
  timePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.xl,
  },
  timeColumn: {
    alignItems: 'center',
  },
  timeButton: {
    padding: spacing.sm,
  },
  timeButtonText: {
    color: colors.primary,
    fontSize: fontSize.xl,
  },
  timeDisplay: {
    fontSize: fontSize.time,
    fontWeight: '200',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    marginVertical: spacing.sm,
  },
  timeSeparator: {
    fontSize: fontSize.time,
    fontWeight: '200',
    color: colors.text,
    marginHorizontal: spacing.md,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  sectionDescription: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    color: colors.text,
    fontSize: fontSize.md,
  },
  addButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  addButtonText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    padding: spacing.lg,
  },
  saveButton: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  saveButtonText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
});
