import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LayoutManager } from "../../components/LayoutManager";
import { LayoutRenderer } from "../../components/LayoutRenderer";
import { TopicSuggestionModal } from "../../components/TopicSuggestionModal";
import { theme } from "../../constants/theme";
import { suggestLayout, type TopicSuggestion } from "../../lib/topic-detection";
import { useLayoutStore } from "../../stores/useLayoutStore";
import { useOnboardingStore } from "../../stores/useOnboardingStore";
import { useOrientation } from "../../hooks/useOrientation";
import { useRosStore } from "../../stores/useRosStore";
import { useSettingsStore } from "../../stores/useSettingsStore";

function ConnectionDot() {
  const status = useRosStore((s) => s.connection.status);
  const error = useRosStore((s) => s.connection.error);
  const url = useRosStore((s) => s.connection.url);
  const transportType = useRosStore((s) => s.transportType);
  const disconnect = useRosStore((s) => s.disconnect);
  const [popupVisible, setPopupVisible] = useState(false);
  const isConnected = status === "connected";

  const dotColor =
    theme.statusColors[status] || theme.colors.statusDisconnected;

  return (
    <>
      <TouchableOpacity
        onPress={() => setPopupVisible(true)}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <View
          style={[
            styles.dot,
            { backgroundColor: dotColor, borderColor: dotColor + "80" },
            Platform.select({
              ios: {
                shadowColor: dotColor,
                shadowRadius: 6,
                shadowOpacity: 0.5,
                shadowOffset: { width: 0, height: 0 },
              },
              android: {
                filter: [
                  {
                    dropShadow: {
                      offsetX: 0,
                      offsetY: 0,
                      standardDeviation: 4,
                      color: dotColor + "88",
                    },
                  },
                ],
              },
            }) as any,
          ]}
        />
      </TouchableOpacity>

      <Modal visible={popupVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.popupOverlay}
          activeOpacity={1}
          onPress={() => setPopupVisible(false)}
        >
          <View style={styles.popupContent}>
            <View style={styles.popupRow}>
              <Text style={styles.popupLabel}>STATUS</Text>
              <Text style={[styles.popupValue, { color: dotColor }]}>
                {status.toUpperCase()}
              </Text>
            </View>
            {url ? (
              <View style={styles.popupRow}>
                <Text style={styles.popupLabel}>URL</Text>
                <Text style={styles.popupValueMono}>{url}</Text>
              </View>
            ) : null}
            <View style={styles.popupRow}>
              <Text style={styles.popupLabel}>TRANSPORT</Text>
              <Text style={styles.popupValue}>
                {transportType.toUpperCase()}
              </Text>
            </View>
            {error ? (
              <View style={styles.popupRow}>
                <Text style={styles.popupLabel}>ERROR</Text>
                <Text style={styles.popupError}>{error}</Text>
              </View>
            ) : null}
            {isConnected && (
              <>
                <View style={styles.popupDivider} />
                <TouchableOpacity
                  style={styles.disconnectButton}
                  onPress={() => {
                    disconnect();
                    setPopupVisible(false);
                  }}
                >
                  <Ionicons name="power-outline" size={14} color={theme.colors.statusError} />
                  <Text style={styles.disconnectText}>Disconnect</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

export default function ControlScreen() {
  const status = useRosStore((s) => s.connection.status);
  const url = useRosStore((s) => s.connection.url);
  const disconnect = useRosStore((s) => s.disconnect);
  const initForRobot = useLayoutStore((s) => s.initForRobot);
  const router = useRouter();
  const { isLandscape } = useOrientation();
  const isDemo = url?.startsWith("demo://");

  const [suggestion, setSuggestion] = useState<TopicSuggestion | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const suggestedForUrls = useOnboardingStore((s) => s.suggestedForUrls);
  const addSuggestedUrl = useOnboardingStore((s) => s.addSuggestedUrl);
  const setActiveLayout = useLayoutStore((s) => s.setActiveLayout);
  const updateWidgetConfig = useLayoutStore((s) => s.updateWidgetConfig);

  const handleExitDemo = () => {
    disconnect();
    router.push("/(tabs)/");
  };

  useEffect(() => {
    if (url && status === "connected") {
      initForRobot(url);
      if (!url.startsWith("demo://")) {
        useOnboardingStore.getState().setFirstLaunchDone();
      }
    }
  }, [url, status]);

  const autoDetectTopics = useSettingsStore((s) => s.autoDetectTopics);
  useEffect(() => {
    if (!autoDetectTopics) return;
    if (status !== "connected" || !url || url.startsWith("demo://")) return;
    if (suggestedForUrls.includes(url)) return;

    const detectTopics = async () => {
      try {
        const topics = await useRosStore.getState().getTopics();
        const result = suggestLayout(topics);
        if (result) {
          setSuggestion(result);
          setShowSuggestion(true);
        }
        addSuggestedUrl(url);
      } catch {}
    };

    const timer = setTimeout(detectTopics, 500);
    return () => clearTimeout(timer);
  }, [status, url, autoDetectTopics]);

  const handleAcceptSuggestion = () => {
    if (!suggestion) return;
    setActiveLayout(suggestion.presetId);

    // Inject detected topic names into widget configs
    setTimeout(() => {
      const updated = useLayoutStore.getState().getActiveLayout();
      if (updated) {
        const applyConfigs = (node: any) => {
          if (
            node.type === "widget" &&
            suggestion.widgetConfigs[node.widgetType]
          ) {
            updateWidgetConfig(node.id, {
              ...node.config,
              ...suggestion.widgetConfigs[node.widgetType],
            });
          }
          if (node.type === "split") {
            node.children.forEach(applyConfigs);
          }
        };
        applyConfigs(updated.tree);
      }
    }, 0);

    setShowSuggestion(false);
    setSuggestion(null);
  };

  const handleDismissSuggestion = () => {
    setShowSuggestion(false);
    setSuggestion(null);
  };

  return (
    <SafeAreaView style={styles.container} edges={isLandscape ? [] : ["top"]}>
      {isLandscape ? (
        // In landscape, LayoutManager is invisible but still renders its modals.
        // The rail button triggers it via layoutListOpen store flag.
        <View style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
          <LayoutManager />
        </View>
      ) : (
        <View style={styles.topBar}>
          <ConnectionDot />
          <LayoutManager />
        </View>
      )}

      {isDemo && status === "connected" && (
        <TouchableOpacity style={styles.demoBanner} onPress={handleExitDemo}>
          <Text style={styles.demoBannerText}>DEMO MODE</Text>
          <Ionicons
            name="close-circle-outline"
            size={14}
            color={theme.colors.statusConnecting}
          />
        </TouchableOpacity>
      )}

      {status !== "connected" ? (
        <View style={styles.disconnected}>
          <Ionicons
            name="wifi-outline"
            size={48}
            color={theme.colors.textMuted}
          />
          <Text style={styles.disconnectedTitle}>Not connected</Text>
          <Text style={styles.disconnectedSubtext}>
            Go to Connect tab to connect to a robot.
          </Text>
        </View>
      ) : (
        <LayoutRenderer />
      )}

      <TopicSuggestionModal
        visible={showSuggestion}
        suggestion={suggestion}
        onAccept={handleAcceptSuggestion}
        onDismiss={handleDismissSuggestion}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgBase,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderDefault,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  disconnected: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  disconnectedTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginTop: 16,
  },
  disconnectedSubtext: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: "center",
    marginTop: 8,
  },
  demoBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FBBF2420",
    borderBottomWidth: 1,
    borderBottomColor: "#FBBF2433",
    paddingVertical: 4,
  },
  demoBannerText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    fontWeight: "700",
    color: theme.colors.statusConnecting,
    letterSpacing: 0.8,
  },
  // Status popup
  popupOverlay: {
    flex: 1,
    backgroundColor: "#00000066",
    justifyContent: "flex-start",
    paddingTop: 100,
    paddingHorizontal: 20,
  },
  popupContent: {
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    borderRadius: theme.radius.lg,
    padding: 16,
    gap: 10,
  },
  popupRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  popupLabel: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    color: theme.colors.textMuted,
    letterSpacing: 0.8,
  },
  popupValue: {
    fontFamily: "SpaceMono",
    fontSize: 12,
    color: theme.colors.textPrimary,
    fontWeight: "500",
  },
  popupValueMono: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    color: theme.colors.textValue,
    flexShrink: 1,
    marginLeft: 16,
    textAlign: "right",
  },
  popupError: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    color: theme.colors.statusError,
    flexShrink: 1,
    marginLeft: 16,
    textAlign: "right",
  },
  popupDivider: {
    height: 1,
    backgroundColor: theme.colors.borderSubtle,
    marginTop: 2,
  },
  disconnectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.statusError + "44",
    backgroundColor: theme.colors.statusError + "11",
  },
  disconnectText: {
    fontFamily: "SpaceMono",
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.statusError,
  },
});
