// components/WidgetPicker.tsx
import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WIDGET_REGISTRY, WIDGET_CATEGORIES } from '../widgets/registry';
import type { WidgetDefinition } from '../types/layout';
import { theme } from '../constants/theme';

interface Props {
  visible: boolean;
  onSelect: (widgetType: string) => void;
  onClose: () => void;
}

export function WidgetPicker({ visible, onSelect, onClose }: Props) {
  const widgets = Object.values(WIDGET_REGISTRY);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>ADD WIDGET</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {WIDGET_CATEGORIES.map((category) => {
              const categoryWidgets = widgets.filter((w) => w.category === category);
              if (categoryWidgets.length === 0) return null;
              return (
                <View key={category} style={styles.categorySection}>
                  <Text style={styles.categoryLabel}>{category.toUpperCase()}</Text>
                  <View style={styles.widgetList}>
                    {categoryWidgets.map((widget) => (
                      <TouchableOpacity
                        key={widget.type}
                        style={styles.widgetItem}
                        onPress={() => onSelect(widget.type)}
                      >
                        <Ionicons
                          name={widget.icon as any}
                          size={18}
                          color={theme.colors.accentPrimary}
                        />
                        <Text style={styles.widgetName}>{widget.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#00000088',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  container: {
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    borderRadius: theme.radius.lg,
    width: '100%',
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  title: {
    ...theme.typography.label,
    color: theme.colors.textSecondary,
  },
  content: {
    padding: 16,
  },
  categorySection: {
    marginBottom: 16,
  },
  categoryLabel: {
    ...theme.typography.label,
    color: theme.colors.textMuted,
    marginBottom: 8,
  },
  widgetList: {
    gap: 2,
  },
  widgetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
  },
  widgetName: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    color: theme.colors.textPrimary,
  },
});
