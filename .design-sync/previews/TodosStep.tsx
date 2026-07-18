import { View } from 'react-native';
import { TodosStep } from 'good-morning';

// TodosStep は固定の起床タスク（スクワット10回）を説明するだけの静的画面で、
// onNext/onBack 以外に見た目を変えるpropsは存在しない（実プロダクトの仕様どおり）。
// そのため2セルとも同一propsで、構成コンテキスト（自然な高さ vs 実際のオンボーディング
// モーダルに近い高さ）だけを変えて確認する。

export function Default() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <TodosStep onNext={() => {}} onBack={() => {}} />
    </View>
  );
}

export function PhoneFrame() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e', height: 640, width: 375 }}>
      <TodosStep onNext={() => {}} onBack={() => {}} />
    </View>
  );
}
