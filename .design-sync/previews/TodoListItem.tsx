import { View } from 'react-native';
import { TodoListItem } from 'good-morning';

/**
 * TodoListItem のプレビュー。
 * 軸: 完了/未完了 × 表示専用/編集可能（editable）。
 * editable=true では onDelete も渡し、削除ボタンの有無まで確認できるようにする。
 */

export function IncompleteReadOnly() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <TodoListItem
        item={{ id: 't1', title: '水を一杯飲む', completed: false }}
        onToggle={() => {}}
      />
    </View>
  );
}

export function CompletedReadOnly() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <TodoListItem
        item={{ id: 't2', title: 'カーテンを開ける', completed: true }}
        onToggle={() => {}}
      />
    </View>
  );
}

export function EditableIncomplete() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <TodoListItem
        item={{ id: 't3', title: '歯を磨く', completed: false }}
        onToggle={() => {}}
        editable
        onChangeTitle={() => {}}
        onDelete={() => {}}
      />
    </View>
  );
}

export function EditableCompleted() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <TodoListItem
        item={{ id: 't4', title: 'ベッドを整える', completed: true }}
        onToggle={() => {}}
        editable
        onChangeTitle={() => {}}
        onDelete={() => {}}
      />
    </View>
  );
}

/** editable だが onDelete 未指定 — 削除ボタンが出ない分岐（アラーム作成中の最後の1件など）を確認する。 */
export function EditableNoDelete() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <TodoListItem
        item={{ id: 't5', title: '着替える', completed: false }}
        onToggle={() => {}}
        editable
        onChangeTitle={() => {}}
      />
    </View>
  );
}
