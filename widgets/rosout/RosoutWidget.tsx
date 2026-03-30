import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useRosStore } from '../../stores/useRosStore';
import { theme } from '../../constants/theme';
import type { WidgetProps } from '../../types/layout';
import { WidgetEmptyState } from '../../components/WidgetEmptyState';
import { TextScaleControls } from '../../components/TextScaleControls';

const MAX_LOGS = 200;

interface LogEntry {
  id: string;
  level: number;
  name: string;
  msg: string;
  stamp: { sec: number; nanosec: number };
}

const SEVERITY_LABELS: Record<number, string> = {
  10: 'DBG',
  20: 'INF',
  30: 'WRN',
  40: 'ERR',
  50: 'FTL',
};

function getSeverityColor(level: number): string {
  if (level >= 40) return theme.colors.statusError;
  if (level >= 30) return theme.colors.statusConnecting;
  if (level >= 20) return theme.colors.textPrimary;
  return theme.colors.textMuted;
}

function getSeverityLabel(level: number): string {
  return SEVERITY_LABELS[level] || `L${level}`;
}

let _logId = 0;

export function RosoutWidget(props: Partial<WidgetProps>) {
  const transport = useRosStore((s) => s.transport);
  const status = useRosStore((s) => s.connection.status);
  const topic = props?.config?.topic || '/rosout';
  const minLevel = Number(props?.config?.minLevel) || 20;

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showEmptyState, setShowEmptyState] = useState(false);
  const [textScale, setTextScale] = useState(1);
  const flatListRef = useRef<FlatList>(null);
  const autoScroll = useRef(true);

  useEffect(() => {
    if (!transport || status !== 'connected') return;
    const sub = transport.subscribe(topic, 'rcl_interfaces/msg/Log', (msg: any) => {
      const entry: LogEntry = {
        id: String(++_logId),
        level: msg.level ?? 20,
        name: msg.name ?? '',
        msg: msg.msg ?? '',
        stamp: msg.stamp ?? { sec: 0, nanosec: 0 },
      };
      setLogs((prev) => {
        const next = [...prev, entry];
        return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
      });
    });
    return () => sub.unsubscribe();
  }, [transport, status, topic]);

  const filteredLogs = logs.filter((l) => l.level >= minLevel);

  useEffect(() => {
    if (status === 'connected' && logs.length === 0) {
      const timer = setTimeout(() => setShowEmptyState(true), 3000);
      return () => clearTimeout(timer);
    }
    setShowEmptyState(false);
  }, [status, logs.length]);

  const renderItem = useCallback(({ item }: { item: LogEntry }) => {
    const color = getSeverityColor(item.level);
    const label = getSeverityLabel(item.level);
    const sz = 10 * textScale;
    const lh = sz * 1.5;
    return (
      <View style={styles.row}>
        <Text style={[styles.level, { color, fontSize: sz, lineHeight: lh }]}>[{label}]</Text>
        <Text style={[styles.nodeName, { fontSize: sz, lineHeight: lh }]} numberOfLines={1}>[{item.name}]</Text>
        <Text style={[styles.message, { color, fontSize: sz, lineHeight: lh }]} numberOfLines={2}>{item.msg}</Text>
      </View>
    );
  }, [textScale]);

  const keyExtractor = useCallback((item: LogEntry) => item.id, []);

  const onContentSizeChange = useCallback(() => {
    if (autoScroll.current && flatListRef.current) {
      flatListRef.current.scrollToEnd({ animated: false });
    }
  }, []);

  const width = props?.width || 300;
  const height = props?.height || 200;

  return (
    <View style={[styles.container, { width, height }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ROSOUT</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.headerCount}>{filteredLogs.length}</Text>
          <TextScaleControls scale={textScale} onScaleChange={setTextScale} />
        </View>
      </View>
      {showEmptyState && logs.length === 0 ? (
        <WidgetEmptyState widgetType="rosout" topicName={topic} />
      ) : (
        <FlatList
          ref={flatListRef}
          data={filteredLogs}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          onContentSizeChange={onContentSizeChange}
          style={styles.list}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.bgBase,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 28,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  headerTitle: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textMuted,
    letterSpacing: 0.8,
  },
  headerCount: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    color: theme.colors.textMuted,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 2,
    gap: 4,
  },
  level: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    width: 36,
  },
  nodeName: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    color: theme.colors.textSecondary,
    maxWidth: 80,
  },
  message: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    flex: 1,
  },
});
