import { View } from 'react-native';
import { StepButton } from 'good-morning';

export function Primary() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <StepButton label="次へ" onPress={() => {}} variant="primary" />
    </View>
  );
}

export function PrimaryDisabled() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <StepButton
        label="次へ"
        onPress={() => {}}
        variant="primary"
        disabled
        style={{ opacity: 0.5 }}
      />
    </View>
  );
}

export function Secondary() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <StepButton label="戻る" onPress={() => {}} variant="secondary" />
    </View>
  );
}

export function SecondaryDisabled() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <StepButton
        label="戻る"
        onPress={() => {}}
        variant="secondary"
        disabled
        style={{ opacity: 0.5 }}
      />
    </View>
  );
}

// PermissionStep/DemoStep が実際に使う「戻る + 次へ」footer の組み方。
// 次へ側は必須権限が未許可の間 disabled + opacity 0.5 になる実態を再現。
export function ButtonRow() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <StepButton label="戻る" onPress={() => {}} variant="secondary" flex={1} />
        <StepButton
          label="次へ"
          onPress={() => {}}
          variant="primary"
          flex={2}
          disabled
          style={{ opacity: 0.5 }}
        />
      </View>
    </View>
  );
}
