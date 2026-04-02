import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useNavigationState } from "@react-navigation/native";
import { useRouter, useSegments } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../constants/theme";
import { useLayoutStore } from "../stores/useLayoutStore";
import { useRosStore } from "../stores/useRosStore";
import { useSettingsStore } from "../stores/useSettingsStore";

export const RAIL_WIDTH = 48;

const TAB_CONFIG: Record<
  string,
  { label: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  index: { label: "Connect", icon: "link-outline" },
  control: { label: "Control", icon: "grid-outline" },
  settings: { label: "Settings", icon: "settings-sharp" },
};

const TAB_ROUTES = ["index", "control", "settings"];

/**
 * Portrait bottom tab bar — rendered via Tabs tabBar prop
 */
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
                {route.name === "index" && isConnected && (
                  <View style={styles.statusDot} />
                )}
              </View>
              {isFocused && <View style={styles.activeIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Landscape side rail — rendered as a sibling to Tabs in _layout.tsx
 */
export function LandscapeTabRail() {
  const connectionStatus = useRosStore((s) => s.connection.status);
  const isConnected = connectionStatus === "connected";
  const insets = useSafeAreaInsets();
  const railSide = useSettingsStore((s) => s.tabRailSide);
  const router = useRouter();
  const segments = useSegments();
  const editMode = useLayoutStore((s) => s.editMode);
  const setEditMode = useLayoutStore((s) => s.setEditMode);

  // Determine active tab from route segments
  const currentSegment = segments[1] || "index"; // segments[0] is "(tabs)"
  const activeIndex = TAB_ROUTES.indexOf(currentSegment);
  const isOnControlTab = currentSegment === "control";

  const isLeft = railSide === "left";
  const sideInset = isLeft ? insets.left : insets.right;

  return (
    <View
      style={[
        styles.railContainer,
        isLeft
          ? { borderRightWidth: 1, borderLeftWidth: 0, paddingLeft: sideInset }
          : { borderLeftWidth: 1, borderRightWidth: 0, paddingRight: sideInset },
        { width: RAIL_WIDTH + sideInset },
      ]}
    >
      {TAB_ROUTES.map((routeName, index) => {
        const isFocused = index === activeIndex;
        const config = TAB_CONFIG[routeName];
        const iconColor = isFocused
          ? theme.colors.accentPrimary
          : theme.colors.textMuted;

        return (
          <TouchableOpacity
            key={routeName}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            onPress={() => {
              if (routeName === "index") router.push("/(tabs)/");
              else router.push(`/(tabs)/${routeName}` as any);
            }}
            style={[styles.railTab, isFocused && styles.railTabActive]}
            activeOpacity={0.7}
          >
            <Ionicons name={config.icon} size={22} color={iconColor} />
            {routeName === "index" && isConnected && (
              <View style={styles.railStatusDot} />
            )}
          </TouchableOpacity>
        );
      })}

      {/* Layout controls on control tab */}
      {isOnControlTab && (
        <View style={styles.railControls}>
          <View style={styles.railDivider} />
          <TouchableOpacity
            style={[styles.railTab, editMode && styles.railEditActive]}
            onPress={() => setEditMode(!editMode)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={editMode ? "checkmark" : "pencil-outline"}
              size={20}
              color={editMode ? "#FFFFFF" : theme.colors.textMuted}
            />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Portrait bottom bar
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
  // Landscape side rail
  railContainer: {
    backgroundColor: theme.colors.bgBase,
    borderColor: theme.colors.borderSubtle,
    justifyContent: "center",
    alignItems: "center",
  },
  railTab: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 4,
  },
  railTabActive: {
    backgroundColor: theme.colors.accentPrimary + "20",
  },
  railStatusDot: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.statusConnected,
  },
  railControls: {
    alignItems: "center",
    marginTop: 8,
  },
  railDivider: {
    width: 24,
    height: 1,
    backgroundColor: theme.colors.borderSubtle,
    marginBottom: 8,
  },
  railEditActive: {
    backgroundColor: theme.colors.accentPrimary,
  },
});
