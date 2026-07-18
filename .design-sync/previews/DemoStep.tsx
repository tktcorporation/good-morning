import { View } from 'react-native';
import { DemoStep } from 'good-morning';

// DemoStep は flex:1 + justifyContent:'space-between' なフルスクリーン構成な
// ので、実機の画面高さに近い bounded height を親に与えないと space-between が
// 意味を持たない（コンテンツが詰まって見える）。
export function Default() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e', height: 700 }}>
      <DemoStep onNext={() => {}} onBack={() => {}} />
    </View>
  );
}

// iPhone SE 相当の低い画面高さでも、下部ボタンが潰れず見えることを確認する。
export function CompactScreen() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e', height: 480 }}>
      <DemoStep onNext={() => {}} onBack={() => {}} />
    </View>
  );
}
