import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WidgetEmptyState } from "../../components/WidgetEmptyState";
import { theme } from "../../constants/theme";
import { useRosStore } from "../../stores/useRosStore";
import type { WidgetProps } from "../../types/layout";

// sensor_msgs/msg/BatteryState power_supply_status values
const POWER_SUPPLY_STATUS: Record<number, string> = {
  0: "UNKNOWN",
  1: "CHARGING",
  2: "DISCHARGING",
  3: "NOT CHARGING",
  4: "FULL",
};

function getBatteryColor(pct: number): string {
  if (pct > 0.5) return theme.colors.statusConnected;
  if (pct > 0.2) return theme.colors.statusConnecting;
  return theme.colors.statusError;
}

function fmt(value: number | undefined, digits: number, unit: string): string {
  if (value === undefined || !isFinite(value)) return "—";
  return value.toFixed(digits) + unit;
}

interface BatteryState {
  voltage?: number;
  current?: number;
  charge?: number;
  capacity?: number;
  percentage?: number;
  power_supply_status?: number;
  present?: boolean;
}

export function BatteryWidget(props: Partial<WidgetProps>) {
  const transport = useRosStore((s) => s.transport);
  const status = useRosStore((s) => s.connection.status);
  const topic = props?.config?.topic || "/battery_state";

  const [battery, setBattery] = useState<BatteryState | null>(null);
  const [showEmptyState, setShowEmptyState] = useState(false);

  const handleMessage = useCallback((msg: BatteryState) => {
    setBattery(msg);
  }, []);

  useEffect(() => {
    if (!transport || status !== "connected") return;
    const sub = transport.subscribe(
      topic,
      "sensor_msgs/msg/BatteryState",
      handleMessage,
    );
    return () => sub.unsubscribe();
  }, [transport, status, topic, handleMessage]);

  useEffect(() => {
    if (status === "connected" && !battery) {
      const timer = setTimeout(() => setShowEmptyState(true), 3000);
      return () => clearTimeout(timer);
    }
    setShowEmptyState(false);
  }, [status, battery]);

  const width = props?.width || 300;
  const height = props?.height || 200;

  const pct = battery?.percentage ?? null;
  const barColor =
    pct !== null ? getBatteryColor(pct) : theme.colors.statusDisconnected;
  const barWidth = pct !== null ? Math.max(0, Math.min(1, pct)) : 0;
  const powerStatus =
    battery?.power_supply_status !== undefined
      ? (POWER_SUPPLY_STATUS[battery.power_supply_status] ?? "UNKNOWN")
      : null;

  return (
    <View style={[styles.container, { width, height }]}>
      <View style={styles.header}>
        <Text style={styles.headerText}>BATTERY</Text>
        {powerStatus && (
          <Text style={[styles.statusText, { color: barColor }]}>
            {powerStatus}
          </Text>
        )}
      </View>

      {showEmptyState && !battery ? (
        <WidgetEmptyState widgetType="battery" topicName={topic} />
      ) : (
        <View style={styles.body}>
          {/* Percentage + bar */}
          <View style={styles.percentRow}>
            <Text style={[styles.percentText, { color: barColor }]}>
              {pct !== null ? Math.round(pct * 100) + "%" : "—"}
            </Text>
          </View>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                {
                  width: `${barWidth * 100}%` as any,
                  backgroundColor: barColor,
                },
              ]}
            />
          </View>

          {/* Metrics grid */}
          <View style={styles.grid}>
            <MetricCell
              label="VOLTAGE"
              value={fmt(battery?.voltage, 2, " V")}
            />
            <MetricCell
              label="CURRENT"
              value={fmt(battery?.current, 2, " A")}
            />
            <MetricCell label="CHARGE" value={fmt(battery?.charge, 2, " Ah")} />
            <MetricCell
              label="CAPACITY"
              value={fmt(battery?.capacity, 2, " Ah")}
            />
          </View>
        </View>
      )}
    </View>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: theme.colors.bgBase, overflow: "hidden" },
  header: {
    zIndex: 3,
    backgroundColor: theme.colors.bgBase,
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
  statusText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 1,
  },
  body: {
    flex: 1,
    padding: 12,
    justifyContent: "space-between",
  },
  percentRow: {
    alignItems: "center",
  },
  percentText: {
    fontFamily: "SpaceMono",
    fontSize: 36,
    fontWeight: "700",
    lineHeight: 44,
  },
  barTrack: {
    height: 6,
    backgroundColor: theme.colors.bgSurface,
    borderRadius: 3,
    overflow: "hidden",
    marginVertical: 6,
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 0,
    marginTop: 4,
  },
  cell: {
    width: "50%",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  cellLabel: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    color: theme.colors.textMuted,
    letterSpacing: 1,
    marginBottom: 2,
  },
  cellValue: {
    fontFamily: "SpaceMono",
    fontSize: 13,
    color: theme.colors.textValue,
  },
});
