import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, Text, View } from 'react-native';
import { MorningRoutineBanner } from '../../src/components/MorningRoutineBanner';
import { colors } from '../../src/constants/theme';

function TabIcon({ label, focused }: { readonly label: string; readonly focused: boolean }) {
  return (
    <Text style={{ fontSize: 22, color: focused ? colors.primary : colors.textMuted }}>
      {label}
    </Text>
  );
}

function TabBarWithBanner(props: BottomTabBarProps) {
  return (
    <View>
      <MorningRoutineBanner />
      <BottomTabBar {...props} />
    </View>
  );
}

export default function TabLayout() {
  const { t } = useTranslation('dashboard');
  const { t: tCommon } = useTranslation('common');

  // BottomTabBar は祖先の FrameSizeProvider（SafeAreaProviderCompat 経由）を要求する。
  // BottomTabView は custom tabBar 関数も同じ Provider 配下で呼び出すため、
  // `@react-navigation/elements` が単一バージョンに揃っていればカスタム tabBar でも動作する。
  // 重複は src/__tests__/no-duplicate-providers.test.ts で検知している。
  const tabBarProps =
    Platform.OS === 'web'
      ? {}
      : { tabBar: (props: BottomTabBarProps) => <TabBarWithBanner {...props} /> };

  return (
    <Tabs
      {...tabBarProps}
      screenOptions={{
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('title'),
          tabBarIcon: ({ focused }) => <TabIcon label="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: tCommon('settings.title'),
          tabBarIcon: ({ focused }) => <TabIcon label="⚙" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
