import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../constants/theme';
import type { TodoItem } from '../types/alarm';

interface TodoListItemProps {
  readonly item: TodoItem;
  readonly onToggle: (id: string) => void;
  readonly editable?: boolean;
  readonly onChangeTitle?: (id: string, title: string) => void;
  readonly onDelete?: (id: string) => void;
}

export function TodoListItem({
  item,
  onToggle,
  editable = false,
  onChangeTitle,
  onDelete,
}: TodoListItemProps) {
  const { t } = useTranslation('alarm');

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.checkbox, item.completed && styles.checkboxChecked]}
        onPress={() => onToggle(item.id)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.completed }}
        accessibilityLabel={t('accessibilityTask', { title: item.title })}
      >
        {item.completed && <Text style={styles.checkmark}>✓</Text>}
      </Pressable>

      {editable ? (
        <TextInput
          style={[styles.title, item.completed && styles.titleCompleted]}
          value={item.title}
          onChangeText={(text) => onChangeTitle?.(item.id, text)}
          placeholder={t('taskPlaceholder')}
          placeholderTextColor={colors.textMuted}
        />
      ) : (
        <Text style={[styles.title, item.completed && styles.titleCompleted]}>{item.title}</Text>
      )}

      {editable && onDelete && (
        <Pressable
          style={styles.deleteButton}
          onPress={() => onDelete(item.id)}
          accessibilityRole="button"
          accessibilityLabel={t('accessibilityDeleteTask', { title: item.title })}
        >
          <Text style={styles.deleteText}>×</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
  },
  checkmark: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: 'bold',
  },
  title: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  deleteButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  deleteText: {
    color: colors.primary,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
  },
});
