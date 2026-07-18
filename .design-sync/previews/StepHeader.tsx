import { View } from 'react-native';
import { StepHeader } from 'good-morning';

export function ShortSubtitle() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <StepHeader title="何時に起きたいですか？" subtitle="あとからいつでも変更できます" />
    </View>
  );
}

export function LongSubtitle() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <StepHeader
        title="アプリの権限をリクエストします"
        subtitle="通知とヘルスケアの許可が必要です。あとから設定アプリでいつでも変更できます。"
      />
    </View>
  );
}
