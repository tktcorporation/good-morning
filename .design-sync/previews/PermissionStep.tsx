import { View } from 'react-native';
import { PermissionStep } from 'good-morning';

// PermissionStep は APP_PERMISSIONS + 内部 useState で状態を持ち、
// granted/denied は permission.request() 完了後にのみ遷移する（props から
// 注入する経路がない）。静的プレビューではボタン押下シミュレーションを
// サポートしないため、実際に最初にユーザーが見る pending 状態のみを描く。
export function Default() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e', height: 700 }}>
      <PermissionStep onNext={() => {}} onBack={() => {}} />
    </View>
  );
}

// 画面高さが足りない場合、権限一覧の ScrollView が内側でスクロールし、
// ヘッダーとフッターのボタンは潰れずに残ることを確認する。
export function CompactScroll() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e', height: 320 }}>
      <PermissionStep onNext={() => {}} onBack={() => {}} />
    </View>
  );
}
