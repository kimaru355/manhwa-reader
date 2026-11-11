import { Ionicons } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import { Pressable, type ColorValue } from 'react-native';

import { useTheme } from '../../lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const tab = (title: string, icon: IconName, iconOff: IconName) => ({
  title,
  tabBarIcon: ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => (
    <Ionicons name={focused ? icon : iconOff} size={size} color={color as string} />
  ),
});

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerTitleAlign: 'center',
        headerStyle: { backgroundColor: t.bg },
        headerShadowVisible: false,
        headerTitleStyle: { color: t.text, fontWeight: '700' },
        headerRight: () => (
          <Pressable hitSlop={10} style={{ marginRight: 16 }} onPress={() => router.push('/settings')}>
            <Ionicons name="settings-outline" size={22} color={t.text} />
          </Pressable>
        ),
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.sub,
        tabBarStyle: { backgroundColor: t.bg, borderTopColor: t.border },
        tabBarLabelStyle: { fontSize: 11 },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={tab('Home', 'home', 'home-outline')} />
      <Tabs.Screen name="discover" options={tab('Discover', 'compass', 'compass-outline')} />
      <Tabs.Screen name="downloads" options={tab('Downloads', 'download', 'download-outline')} />
      <Tabs.Screen name="favorites" options={tab('Favorites', 'heart', 'heart-outline')} />
      <Tabs.Screen name="wishlist" options={tab('Wishlist', 'star', 'star-outline')} />
      <Tabs.Screen name="recent" options={tab('Recent', 'time', 'time-outline')} />
    </Tabs>
  );
}
