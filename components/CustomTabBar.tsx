import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../constants/theme";
import { useRosStore } from "../stores/useRosStore";

const TAB_CONFIG: Record<string, { label: string }> = {
  index: { label: "Connect" },
  control: { label: "Control" },
  settings: { label: "Settings" },
};

export function CustomTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const connectionStatus = useRosStore((s) => s.connection.status);
  const isConnected = connectionStatus === "connected";
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={styles.tabBar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const config = TAB_CONFIG[route.name] || { label: route.name };

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          const color = isFocused
            ? theme.colors.accentPrimary
            : theme.colors.textMuted;

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.tab}
              activeOpacity={0.7}
            >
              <View style={styles.labelContainer}>
                <Text style={[styles.label, { color }]} numberOfLines={1}>
                  {config.label}
                </Text>
                {/* Connection status dot on the Connect tab */}
                {route.name === "index" && isConnected && (
                  <View style={styles.statusDot} />
                )}
              </View>
              {/* Active indicator line */}
              {isFocused && <View style={styles.activeIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.bgBase,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: theme.colors.bgBase,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
    paddingTop: 8,
    paddingBottom: 8,
    marginHorizontal: 0,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  labelContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.statusConnected,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "SpaceMono",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  activeIndicator: {
    position: "absolute",
    top: -8,
    width: 24,
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.colors.accentPrimary,
  },
});
