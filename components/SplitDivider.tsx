import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { theme } from "../constants/theme";
import { useOrientation } from "../hooks/useOrientation";
import { useLayoutStore } from "../stores/useLayoutStore";
import { findNode } from "../types/layout";
import { getWidget } from "../widgets/registry";

interface Props {
  nodeId: string;
  direction: "horizontal" | "vertical";
  totalSize: number;
}

const DIVIDER_SIZE = 1;
const RATIO_STEP = 0.05;

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export function SplitDivider({ nodeId, direction }: Props) {
  const updateSplitRatio = useLayoutStore((s) => s.updateSplitRatio);
  const swapChildren = useLayoutStore((s) => s.swapChildren);
  const editMode = useLayoutStore((s) => s.editMode);
  const { isLandscape } = useOrientation();
  const [modalVisible, setModalVisible] = useState(false);

  const getCurrentRatio = (): number => {
    const layout = useLayoutStore.getState().getActiveLayout();
    if (!layout) return 0.5;
    const node = findNode(layout.tree, nodeId);
    if (node && node.type === "split") return node.ratio;
    return 0.5;
  };

  const getChildNames = (): [string, string] => {
    const layout = useLayoutStore.getState().getActiveLayout();
    if (!layout) return ["First", "Second"];
    const node = findNode(layout.tree, nodeId);
    if (!node || node.type !== "split") return ["First", "Second"];
    const nameOf = (child: any): string => {
      if (child.type === "widget") {
        const def = getWidget(child.widgetType);
        return def?.name || child.widgetType;
      }
      return "Group";
    };
    return [nameOf(node.children[0]), nameOf(node.children[1])];
  };

  const nudge = (delta: number) => {
    const current = getCurrentRatio();
    const clamped = Math.max(0.15, Math.min(0.85, current + delta));
    updateSplitRatio(nodeId, clamped);
  };

  const isVertical = direction === "vertical";

  return (
    <View
      style={[styles.divider, isVertical ? styles.horizontal : styles.vertical]}
    >
      <View
        style={[
          styles.line,
          isVertical ? styles.lineHorizontal : styles.lineVertical,
        ]}
      />
      {editMode && (
        <AnimatedTouchable
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={styles.handleTap}
          onPress={() => setModalVisible(true)}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        >
          <View style={styles.circleHandle}>
            <Ionicons
              name={
                isVertical ? "swap-vertical-outline" : "swap-horizontal-outline"
              }
              size={12}
              color={theme.colors.accentPrimary}
            />
          </View>
        </AnimatedTouchable>
      )}

      <Modal visible={modalVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>RESIZE & SWAP</Text>

            {/* Resize controls — chevrons swap in landscape since grid is rotated */}
            <View style={styles.resizeRow}>
              <TouchableOpacity
                style={styles.resizeArrow}
                onPress={() => nudge(-RATIO_STEP)}
              >
                <Ionicons
                  name={
                    isLandscape
                      ? (isVertical ? "chevron-back" : "chevron-up")
                      : (isVertical ? "chevron-up" : "chevron-back")
                  }
                  size={20}
                  color={theme.colors.textPrimary}
                />
              </TouchableOpacity>

              <Text style={styles.ratioText}>
                {Math.round(getCurrentRatio() * 100)}%
              </Text>

              <TouchableOpacity
                style={styles.resizeArrow}
                onPress={() => nudge(RATIO_STEP)}
              >
                <Ionicons
                  name={
                    isLandscape
                      ? (isVertical ? "chevron-forward" : "chevron-down")
                      : (isVertical ? "chevron-down" : "chevron-forward")
                  }
                  size={20}
                  color={theme.colors.textPrimary}
                />
              </TouchableOpacity>
            </View>

            {/* Swap */}
            {(() => {
              const [first, second] = getChildNames();
              return (
                <TouchableOpacity
                  style={[styles.menuItem, styles.menuItemLast]}
                  onPress={() => {
                    swapChildren(nodeId);
                    setModalVisible(false);
                  }}
                >
                  <Ionicons
                    name={isVertical ? "swap-vertical" : "swap-horizontal"}
                    size={18}
                    color={theme.colors.accentPrimary}
                  />
                  <Text style={styles.swapText}>
                    Swap {first} ↔ {second}
                  </Text>
                </TouchableOpacity>
              );
            })()}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  divider: {
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    elevation: 100,
    overflow: "visible",
  },
  line: {
    position: "absolute",
    backgroundColor: theme.colors.borderSubtle,
  },
  lineHorizontal: {
    height: 1,
    left: 0,
    right: 0,
  },
  lineVertical: {
    width: 1,
    top: 0,
    bottom: 0,
  },
  horizontal: {
    height: DIVIDER_SIZE,
    width: "100%",
  },
  vertical: {
    width: DIVIDER_SIZE,
    height: "100%",
  },
  handleTap: {
    position: "absolute",
    zIndex: 50,
    elevation: 50,
  },
  circleHandle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.accentPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "#00000088",
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  modalContent: {
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    borderRadius: theme.radius.lg,
    width: "100%",
    maxWidth: 280,
    overflow: "hidden",
  },
  modalTitle: {
    ...theme.typography.label,
    color: theme.colors.textMuted,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
    textAlign: "center",
  },
  resizeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  resizeArrow: {
    alignItems: "center",
    gap: 4,
    padding: 8,
  },
  resizeHint: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
  ratioText: {
    fontFamily: "SpaceMono",
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  swapText: {
    fontFamily: "SpaceMono",
    fontSize: 13,
    color: theme.colors.accentPrimary,
  },
});
