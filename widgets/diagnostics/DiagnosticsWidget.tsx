import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { TextScaleControls } from "../../components/TextScaleControls";
import { WidgetEmptyState } from "../../components/WidgetEmptyState";
import { theme } from "../../constants/theme";
import { useRosStore } from "../../stores/useRosStore";
import type { WidgetProps } from "../../types/layout";

interface DiagnosticStatus {
  name: string;
  message: string;
  level: number;
  hardware_id: string;
}

const LEVEL_LABELS = ["OK", "WARN", "ERROR", "STALE"] as const;

const LEVEL_COLORS: Record<number, string> = {
  0: theme.colors.statusConnected,
  1: theme.colors.statusConnecting,
  2: theme.colors.statusError,
  3: theme.colors.statusDisconnected,
};

function getLevelColor(level: number): string {
  return LEVEL_COLORS[level] ?? theme.colors.statusDisconnected;
}

function getLevelLabel(level: number): string {
  return LEVEL_LABELS[level] ?? "UNKNOWN";
}

export function DiagnosticsWidget(props: Partial<WidgetProps>) {
  const transport = useRosStore((s) => s.transport);
  const status = useRosStore((s) => s.connection.status);
  const topic = props?.config?.topic || "/diagnostics";

  const [statusMap, setStatusMap] = useState<Map<string, DiagnosticStatus>>(
    new Map(),
  );
  const [showEmptyState, setShowEmptyState] = useState(false);
  const [textScale, setTextScale] = useState(1);

  const handleMessage = useCallback((msg: any) => {
    const statuses: DiagnosticStatus[] = msg.status ?? [];
    if (statuses.length === 0) return;
    setStatusMap((prev) => {
      const next = new Map(prev);
      for (const s of statuses) {
        next.set(s.name, {
          name: s.name,
          message: s.message,
          level: s.level,
          hardware_id: s.hardware_id,
        });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!transport || status !== "connected") return;
    const sub = transport.subscribe(
      topic,
      "diagnostic_msgs/msg/DiagnosticArray",
      handleMessage,
    );
    return () => sub.unsubscribe();
  }, [transport, status, topic, handleMessage]);

  const hasData = statusMap.size > 0;

  useEffect(() => {
    if (status === "connected" && !hasData) {
      const timer = setTimeout(() => setShowEmptyState(true), 3000);
      return () => clearTimeout(timer);
    }
    setShowEmptyState(false);
  }, [status, hasData]);

  const sorted = Array.from(statusMap.values()).sort((a, b) => {
    if (b.level !== a.level) return b.level - a.level;
    return a.name.localeCompare(b.name);
  });

  const width = props?.width || 300;
  const height = props?.height || 200;

  return (
    <View style={[styles.container, { width, height }]}>
      <View style={styles.header}>
        <Text style={styles.headerText}>DIAGNOSTICS</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={styles.countText}>{sorted.length}</Text>
          <TextScaleControls scale={textScale} onScaleChange={setTextScale} />
        </View>
      </View>
      {showEmptyState && sorted.length === 0 ? (
        <WidgetEmptyState widgetType="diagnostics" topicName={topic} />
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
        >
          {sorted.map((item) => (
            <View key={item.name} style={styles.row}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: getLevelColor(item.level) },
                ]}
              />
              <View style={styles.rowText}>
                <Text
                  style={[styles.name, { fontSize: 11 * textScale }]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                <Text
                  style={[
                    styles.detail,
                    {
                      color: getLevelColor(item.level),
                      fontSize: 9 * textScale,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {getLevelLabel(item.level)} {item.message}
                </Text>
              </View>
            </View>
          ))}
          {sorted.length === 0 && !showEmptyState && (
            <Text style={styles.empty}>No diagnostics received</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: theme.colors.bgBase, overflow: "hidden" },
  header: {
    backgroundColor: theme.colors.bgBase,
    zIndex: 3,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 28,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#222222",
  },
  headerText: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    color: theme.colors.textMuted,
    letterSpacing: 1.5,
  },
  countText: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    color: theme.colors.textValue,
  },
  list: { flex: 1 },
  listContent: { paddingVertical: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowText: { flex: 1 },
  name: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    color: theme.colors.textValue,
  },
  detail: { fontFamily: "SpaceMono", fontSize: 9, marginTop: 1 },
  empty: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    color: theme.colors.textMuted,
    textAlign: "center",
    paddingTop: 20,
  },
});
