import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CustomTabBar, LandscapeTabRail, RAIL_WIDTH } from '../../components/CustomTabBar';
import { useOrientation } from '../../hooks/useOrientation';
import { useSettingsStore } from '../../stores/useSettingsStore';

export default function TabLayout() {
  const { isLandscape } = useOrientation();
  const tabRailSide = useSettingsStore((s) => s.tabRailSide);
  const insets = useSafeAreaInsets();

  if (isLandscape) {
    const isLeft = tabRailSide === 'left';
    return (
      <View style={{ flex: 1, flexDirection: isLeft ? 'row' : 'row-reverse' }}>
        <LandscapeTabRail />
        <View style={{ flex: 1 }}>
          <Tabs
            tabBar={() => <View />}
            screenOptions={{ headerShown: false }}
          >
            <Tabs.Screen name="index" />
            <Tabs.Screen name="control" />
            <Tabs.Screen name="settings" />
          </Tabs>
        </View>
      </View>
    );
  }

  return (
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
  );
}
