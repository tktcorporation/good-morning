import { View } from 'react-native';
import { WelcomeStep } from 'good-morning';

// WelcomeStep はオンボーディング最初の静的な挨拶画面で、onNext以外に見た目を
// 変えるpropsは存在しない。2セルとも同一propsで、構成コンテキスト（自然な高さ vs
// 実際のオンボーディングモーダルに近い高さ）だけを変えて確認する。

export function Default() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <WelcomeStep onNext={() => {}} />
    </View>
  );
}

export function PhoneFrame() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e', height: 640, width: 375 }}>
      <WelcomeStep onNext={() => {}} />
    </View>
  );
}
