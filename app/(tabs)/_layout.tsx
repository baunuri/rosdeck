import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CustomTabBar, RAIL_WIDTH } from '../../components/CustomTabBar';
import { useOrientation } from '../../hooks/useOrientation';
import { useSettingsStore } from '../../stores/useSettingsStore';

export default function TabLayout() {
  const { isLandscape } = useOrientation();
  const tabRailSide = useSettingsStore((s) => s.tabRailSide);
  const insets = useSafeAreaInsets();

  const contentStyle = isLandscape
    ? {
        flex: 1 as const,
        ...(tabRailSide === 'left'
          ? { marginLeft: RAIL_WIDTH + insets.left }
          : { marginRight: RAIL_WIDTH + insets.right }),
      }
    : { flex: 1 as const };

  return (
    <View style={contentStyle}>
      <Tabs
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="control" />
        <Tabs.Screen name="settings" />
      </Tabs>
    </View>
  );
}
