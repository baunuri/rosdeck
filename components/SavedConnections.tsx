import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRosStore } from '../stores/useRosStore';
import { theme } from '../constants/theme';

interface Props {
  onSelect: (url: string) => void;
}

export function SavedConnections({ onSelect }: Props) {
  const savedConnections = useRosStore((s) => s.savedConnections);
  const removeSavedConnection = useRosStore((s) => s.removeSavedConnection);

  const sorted = [...savedConnections].sort((a, b) => b.lastUsed - a.lastUsed);

  if (sorted.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>RECENT CONNECTIONS</Text>
      {sorted.map((item) => (
        <TouchableOpacity key={item.url} style={styles.item} onPress={() => onSelect(item.url)}>
          <View style={styles.itemText}>
            <Text style={styles.name}>{item.name || item.url}</Text>
            {item.name && <Text style={styles.url}>{item.url}</Text>}
          </View>
          <TouchableOpacity
            onPress={() => removeSavedConnection(item.url)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close-circle-outline" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginHorizontal: 20, paddingTop: 0 },
  title: {
    ...theme.typography.label,
    color: theme.colors.textMuted,
    marginBottom: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  itemText: { flex: 1 },
  name: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'SpaceMono',
    color: theme.colors.textPrimary,
  },
  url: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
});
