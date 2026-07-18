import { View } from 'react-native';
import { ConfirmStep } from 'good-morning';

// ConfirmStep も flex:1 + justifyContent:'space-between' なフルスクリーン構成
// なので、実機の画面高さに近い bounded height を与える。
export function Default() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e', height: 700 }}>
      <ConfirmStep onConfirm={() => {}} onBack={() => {}} />
    </View>
  );
}

// iPhone SE 相当の低い画面高さでも、オン/戻る/あとで の3ボタンが潰れず
// 見えることを確認する。
export function CompactScreen() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e', height: 480 }}>
      <ConfirmStep onConfirm={() => {}} onBack={() => {}} />
    </View>
  );
}
