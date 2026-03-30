// components/TopicPicker.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRosStore } from '../stores/useRosStore';
import type { TopicInfo } from '../lib/transport';
import { theme } from '../constants/theme';

interface Props {
  value: string;
  filterMessageTypes?: string[];
  onSelect: (topic: string) => void;
}

export function TopicPicker({ value, filterMessageTypes, onSelect }: Props) {
  const [topics, setTopics] = useState<TopicInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [manualEntry, setManualEntry] = useState('');
  const transport = useRosStore((s) => s.transport);

  const discover = async () => {
    if (!transport) return;
    setLoading(true);
    try {
      const all = await transport.getTopics();
      const unique = all.filter((t, i, arr) => arr.findIndex((u) => u.name === t.name) === i);
      const filtered = filterMessageTypes?.length
        ? unique.filter((t) => filterMessageTypes.includes(t.type))
        : unique;
      filtered.sort((a, b) => a.name.localeCompare(b.name));
      setTopics(filtered);
    } catch {
      setTopics([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (expanded) discover();
  }, [expanded]);

  if (!expanded) {
    return (
      <TouchableOpacity style={styles.collapsed} onPress={() => setExpanded(true)}>
        <Text style={styles.topicValue}>{value || 'Select topic...'}</Text>
        <Ionicons name="chevron-down" size={16} color={theme.colors.textMuted} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={() => setExpanded(false)}>
        <Text style={styles.topicValue}>{value || 'Select topic...'}</Text>
        <Ionicons name="chevron-up" size={16} color={theme.colors.textMuted} />
      </TouchableOpacity>

      <View style={styles.listContainer}>
        <View style={styles.manualRow}>
          <TextInput
            style={styles.manualInput}
            value={manualEntry}
            onChangeText={setManualEntry}
            placeholder="Filter or enter /topic/name"
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.manualButton, !manualEntry.trim() && styles.disabled]}
            onPress={() => {
              if (manualEntry.trim()) {
                onSelect(manualEntry.trim());
                setManualEntry('');
                setExpanded(false);
              }
            }}
            disabled={!manualEntry.trim()}
          >
            <Text style={styles.manualButtonText}>SET</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.colors.accentPrimary} style={styles.loader} />
        ) : (() => {
          const query = manualEntry.trim().toLowerCase();
          const visible = query
            ? topics.filter((t) => t.name.toLowerCase().includes(query) || t.type.toLowerCase().includes(query))
            : topics;
          return visible.length > 0 ? (
            <ScrollView style={styles.list} nestedScrollEnabled>
              {visible.map((t) => (
                <TouchableOpacity
                  key={t.name}
                  style={[styles.topicItem, t.name === value && styles.topicItemActive]}
                  onPress={() => { onSelect(t.name); setManualEntry(''); setExpanded(false); }}
                >
                  <Text style={styles.topicName}>{t.name}</Text>
                  <Text style={styles.topicType}>{t.type}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.emptyText}>
              {topics.length > 0 ? 'No matching topics.' : 'No topics found. Enter manually above.'}
            </Text>
          );
        })()}

        <TouchableOpacity style={styles.refreshButton} onPress={discover}>
          <Ionicons name="refresh" size={14} color={theme.colors.textSecondary} />
          <Text style={styles.refreshText}>REFRESH</Text>
        </TouchableOpacity>
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
  topicValue: {
    fontFamily: 'SpaceMono',
    fontSize: 13,
    color: theme.colors.textValue,
  },
  listContainer: {
    backgroundColor: theme.colors.bgElevated,
  },
  list: {
    maxHeight: 150,
  },
  loader: {
    padding: 16,
  },
  topicItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  topicItemActive: {
    backgroundColor: theme.colors.accentPrimaryMuted,
  },
  topicName: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    color: theme.colors.textPrimary,
  },
  topicType: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  emptyText: {
    padding: 12,
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  refreshText: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
  },
  manualRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  manualInput: {
    flex: 1,
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    borderRadius: theme.radius.md,
    padding: 8,
    fontFamily: 'SpaceMono',
    fontSize: 12,
    color: theme.colors.textValue,
  },
  manualButton: {
    backgroundColor: theme.colors.accentPrimary,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  manualButtonText: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  disabled: {
    opacity: 0.35,
  },
});
