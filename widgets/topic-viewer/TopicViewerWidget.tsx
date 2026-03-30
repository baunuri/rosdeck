import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRosStore } from '../../stores/useRosStore';
import { theme } from '../../constants/theme';
import type { WidgetProps } from '../../types/layout';
import { WidgetEmptyState } from '../../components/WidgetEmptyState';
import { TextScaleControls } from '../../components/TextScaleControls';

const MAX_HISTORY = 50;
const MAX_MESSAGE_SIZE = 4096; // chars — skip messages that would freeze the UI

// Message types that contain large binary data and should not be displayed as JSON
const BLOCKED_TYPES = new Set([
  'sensor_msgs/msg/Image',
  'sensor_msgs/msg/CompressedImage',
  'sensor_msgs/msg/PointCloud2',
  'nav_msgs/msg/OccupancyGrid',
  'sensor_msgs/msg/CameraInfo',
  'theora_image_transport/msg/Packet',
  'map_msgs/msg/OccupancyGridUpdate',
]);

export function TopicViewerWidget(props: Partial<WidgetProps>) {
  const transport = useRosStore((s) => s.transport);
  const status = useRosStore((s) => s.connection.status);
  const topic = props?.config?.topic || '';
  const messageType = props?.config?.messageType || '';
  const showHistory = props?.config?.showHistory || false;

  const [latestMessage, setLatestMessage] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [messageCount, setMessageCount] = useState(0);
  const [showEmptyState, setShowEmptyState] = useState(false);
  const [resolvedType, setResolvedType] = useState<string>(messageType);
  const [textScale, setTextScale] = useState(1);
  const scrollRef = useRef<ScrollView>(null);

  const showHistoryRef = useRef(showHistory);
  showHistoryRef.current = showHistory;

  const handleMessage = useCallback(
    (msg: any) => {
      setLatestMessage(msg);
      setMessageCount((c) => c + 1);
      if (showHistoryRef.current) {
        setHistory((prev) => {
          const next = [...prev, msg];
          return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
        });
      }
    },
    [],
  );

  const handleMessageRef = useRef(handleMessage);
  handleMessageRef.current = handleMessage;

  // Resolve message type and subscribe in one effect to avoid cascading state updates
  useEffect(() => {
    if (!transport || status !== 'connected' || !topic) return;

    let sub: { unsubscribe: () => void } | null = null;
    let cancelled = false;

    const doSubscribe = (type: string) => {
      if (cancelled || BLOCKED_TYPES.has(type)) return;
      setResolvedType(type);
      setLatestMessage(null);
      setHistory([]);
      setMessageCount(0);
      sub = transport.subscribe(topic, type, (msg: any) => handleMessageRef.current(msg));
    };

    if (messageType) {
      doSubscribe(messageType);
    } else {
      transport.getTopics().then((topics: Array<{ name: string; type: string }>) => {
        const match = topics.find((t) => t.name === topic);
        if (match) doSubscribe(match.type);
      }).catch(() => {});
    }

    return () => {
      cancelled = true;
      sub?.unsubscribe();
    };
  }, [transport, status, topic, messageType]);

  const isBlocked = BLOCKED_TYPES.has(resolvedType);

  useEffect(() => {
    if (status === 'connected' && topic && resolvedType && !latestMessage) {
      const timer = setTimeout(() => setShowEmptyState(true), 3000);
      return () => clearTimeout(timer);
    }
    setShowEmptyState(false);
  }, [status, topic, resolvedType, latestMessage]);

  const width = props?.width || 300;
  const height = props?.height || 300;

  if (!topic) {
    return (
      <View style={[styles.container, { width, height }]}>
        <Text style={styles.placeholder}>Configure a topic in widget settings</Text>
      </View>
    );
  }

  if (isBlocked) {
    return (
      <View style={[styles.container, { width, height }]}>
        <View style={styles.header}>
          <Text style={styles.topicName} numberOfLines={1}>{topic}</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={styles.placeholder}>
            {resolvedType.split('/').pop()} topics contain large binary data and cannot be displayed as text.
            {'\n\n'}Use the appropriate widget instead.
          </Text>
        </View>
      </View>
    );
  }

  if (status !== 'connected') {
    return (
      <View style={[styles.container, { width, height }]}>
        <Text style={styles.placeholder}>Not connected</Text>
      </View>
    );
  }

  const formatMessage = (msg: any) => {
    try {
      const json = JSON.stringify(msg, null, 2);
      if (json.length > MAX_MESSAGE_SIZE) {
        return json.slice(0, MAX_MESSAGE_SIZE) + '\n\n… (truncated)';
      }
      return json;
    } catch {
      return String(msg);
    }
  };

  return (
    <View style={[styles.container, { width, height }]}>
      <View style={styles.header}>
        <Text style={styles.topicName} numberOfLines={1}>
          {topic}
        </Text>
        <View style={styles.headerRight}>
          <Text style={styles.msgCount}>{messageCount} msgs</Text>
          <TextScaleControls scale={textScale} onScaleChange={setTextScale} />
        </View>
      </View>
      {showEmptyState && !latestMessage ? (
        <WidgetEmptyState widgetType="topic-viewer" topicName={topic} />
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {showHistory ? (
            history.map((msg, i) => (
              <View key={i} style={styles.historyEntry}>
                <Text style={[styles.historyIndex, { fontSize: 10 * textScale, lineHeight: 10 * textScale * 1.5 }]}>#{i + 1}</Text>
                <Text style={[styles.jsonText, { fontSize: 12 * textScale, lineHeight: 12 * textScale * 1.5 }]}>{formatMessage(msg)}</Text>
              </View>
            ))
          ) : latestMessage ? (
            <Text style={[styles.jsonText, { fontSize: 12 * textScale, lineHeight: 12 * textScale * 1.5 }]}>{formatMessage(latestMessage)}</Text>
          ) : (
            <Text style={styles.placeholder}>Waiting for messages...</Text>
          )}
        </ScrollView>
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
  topicName: {
    ...theme.typography.monoSm,
    color: theme.colors.accentPrimary,
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  msgCount: {
    ...theme.typography.labelSm,
    color: theme.colors.textMuted,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.sm,
  },
  jsonText: {
    ...theme.typography.monoSm,
    color: theme.colors.textValue,
  },
  placeholder: {
    ...theme.typography.bodySm,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: theme.spacing.lg,
  },
  historyEntry: {
    marginBottom: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  historyIndex: {
    ...theme.typography.monoXs,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.xs,
  },
});
