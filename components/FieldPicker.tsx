import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRosStore } from '../stores/useRosStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { theme } from '../constants/theme';

interface Props {
  topic: string;
  value: string;
  onSelect: (field: string, messageType: string) => void;
}

// Module-level cache: topic → { paths, messageType }
// Shared across all FieldPicker instances so the second series with the
// same topic doesn't need to re-subscribe (avoids transport dedup issues).
const topicCache = new Map<string, { paths: string[]; messageType: string }>();

export function extractNumericPaths(obj: any, prefix = '', depth = 0, maxDepth = 8, arrayLimit = 32): string[] {
  if (obj == null || depth > maxDepth) return [];
  if (typeof obj === 'number') return prefix ? [prefix] : [];
  if (Array.isArray(obj)) {
    return obj.slice(0, arrayLimit).flatMap((v, i) =>
      extractNumericPaths(v, prefix ? `${prefix}.${i}` : String(i), depth + 1, maxDepth, arrayLimit)
    );
  }
  if (typeof obj === 'object') {
    return Object.entries(obj).flatMap(([k, v]) =>
      extractNumericPaths(v, prefix ? `${prefix}.${k}` : k, depth + 1, maxDepth, arrayLimit)
    );
  }
  return [];
}

export function getFieldValue(obj: any, path: string): number | undefined {
  if (!path || obj == null) return undefined;
  let cur = obj;
  for (const part of path.split('.')) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return typeof cur === 'number' ? cur : undefined;
}

export function FieldPicker({ topic, value, onSelect }: Props) {
  const transport = useRosStore((s) => s.transport);
  const status = useRosStore((s) => s.connection.status);
  const maxDepth = useSettingsStore((s) => s.fieldPickerDepth);
  const arrayLimit = useSettingsStore((s) => s.fieldPickerArrayLimit);

  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [paths, setPaths] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const messageTypeRef = useRef('');
  const subRef = useRef<{ unsubscribe: () => void } | null>(null);

  // Reset when topic changes
  useEffect(() => {
    setPaths([]);
    setExpanded(false);
    setError(null);
    messageTypeRef.current = '';
  }, [topic]);

  // Clear cache only on actual transport change (not on initial mount).
  // Each FieldPicker instance runs effects on mount; without this guard the
  // second instance (e.g. second chart series) would wipe the cache populated
  // by the first, causing it to re-subscribe and potentially hang.
  const prevTransportRef = useRef(transport);
  useEffect(() => {
    if (prevTransportRef.current && prevTransportRef.current !== transport) {
      topicCache.clear();
    }
    prevTransportRef.current = transport;
  }, [transport]);

  // Sample topic when expanded
  useEffect(() => {
    if (!expanded || !topic || !transport || status !== 'connected') return;

    // Use cached paths immediately if available — avoids a second transport
    // subscription to the same topic (which some transports don't deliver).
    const cached = topicCache.get(topic);
    if (cached) {
      messageTypeRef.current = cached.messageType;
      setPaths(cached.paths);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPaths([]);

    transport.getTopics().then((topics) => {
      if (cancelled) return;
      const found = topics.find((t) => t.name === topic);
      if (!found) {
        setError('Topic not found');
        setLoading(false);
        return;
      }
      messageTypeRef.current = found.type;
      const sub = transport.subscribe(found.name, found.type, (msg: any) => {
        if (cancelled) return;
        sub.unsubscribe();
        subRef.current = null;
        const sampledPaths = extractNumericPaths(msg, '', 0, maxDepth, arrayLimit);
        topicCache.set(topic, { paths: sampledPaths, messageType: found.type });
        setPaths(sampledPaths);
        setLoading(false);
      });
      subRef.current = sub;
    }).catch(() => {
      if (!cancelled) {
        setError('Failed to resolve topic');
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      subRef.current?.unsubscribe();
      subRef.current = null;
    };
  }, [expanded, topic, transport, status]);

  if (!expanded) {
    return (
      <TouchableOpacity
        style={[styles.collapsed, !topic && styles.disabled]}
        onPress={() => { if (topic) setExpanded(true); }}
        disabled={!topic}
      >
        <Text style={[styles.valueText, !value && styles.placeholder]}>
          {value || (topic ? 'Select field...' : 'Select topic first')}
        </Text>
        <Ionicons name="chevron-down" size={14} color={theme.colors.textMuted} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={() => setExpanded(false)}>
        <Text style={[styles.valueText, !value && styles.placeholder]}>
          {value || 'Select field...'}
        </Text>
        <Ionicons name="chevron-up" size={14} color={theme.colors.textMuted} />
      </TouchableOpacity>
      <View style={styles.body}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="small" color={theme.colors.accentPrimary} />
            <Text style={styles.hint}>Sampling topic...</Text>
          </View>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : paths.length === 0 ? (
          <Text style={styles.hint}>No numeric fields found</Text>
        ) : (
          <ScrollView style={styles.list} nestedScrollEnabled>
            {paths.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.item, p === value && styles.itemActive]}
                onPress={() => {
                  onSelect(p, messageTypeRef.current);
                  setExpanded(false);
                }}
              >
                <Text style={[styles.itemText, p === value && styles.itemTextActive]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  collapsed: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    borderRadius: theme.radius.md,
    padding: 10,
  },
  disabled: { opacity: 0.5 },
  container: {
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.bgSurface,
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  body: { backgroundColor: theme.colors.bgElevated },
  list: { maxHeight: 180 },
  item: { padding: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.borderSubtle },
  itemActive: { backgroundColor: theme.colors.accentPrimaryMuted },
  itemText: { fontFamily: 'SpaceMono', fontSize: 12, color: theme.colors.textValue },
  itemTextActive: { color: theme.colors.accentPrimary },
  valueText: { fontFamily: 'SpaceMono', fontSize: 13, color: theme.colors.textValue },
  placeholder: { color: theme.colors.textMuted },
  center: { padding: 16, alignItems: 'center', gap: 8 },
  hint: { fontFamily: 'SpaceMono', fontSize: 11, color: theme.colors.textMuted, padding: 12 },
  errorText: { fontFamily: 'SpaceMono', fontSize: 11, color: theme.colors.statusError, padding: 12 },
});
