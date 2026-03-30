import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native';
import { theme } from '../constants/theme';
import type { TopicSuggestion } from '../lib/topic-detection';
import { PRESET_TEMPLATES } from '../constants/presets';

interface Props {
  visible: boolean;
  suggestion: TopicSuggestion | null;
  onAccept: () => void;
  onDismiss: () => void;
}

function shortType(fullType: string): string {
  const parts = fullType.split('/');
  return parts[parts.length - 1];
}

export function TopicSuggestionModal({ visible, suggestion, onAccept, onDismiss }: Props) {
  if (!suggestion) return null;

  const presetName = PRESET_TEMPLATES.find((p) => p.id === suggestion.presetId)?.name ?? suggestion.presetId;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>DETECTED TOPICS</Text>

          <ScrollView style={styles.topicList}>
            {suggestion.detectedTopics.map((topic) => (
              <View key={topic.name} style={styles.topicRow}>
                <Text style={styles.topicName} numberOfLines={1}>{topic.name}</Text>
                <Text style={styles.topicType}>{shortType(topic.type)}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.suggestion}>
            <Text style={styles.suggestLabel}>SUGGESTED LAYOUT</Text>
            <Text style={styles.suggestName}>{presetName}</Text>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={[styles.button, styles.dismissButton]} onPress={onDismiss}>
              <Text style={styles.dismissText}>DISMISS</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.acceptButton]} onPress={onAccept}>
              <Text style={styles.acceptText}>ACCEPT</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#000000CC',
    justifyContent: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    borderRadius: theme.radius.lg,
    padding: 20,
  },
  title: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.accentPrimary,
    letterSpacing: 0.8,
    marginBottom: 16,
  },
  topicList: {
    maxHeight: 200,
  },
  topicRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  topicName: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    color: theme.colors.textValue,
    flex: 1,
    marginRight: 12,
  },
  topicType: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  suggestion: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderDefault,
    alignItems: 'center',
  },
  suggestLabel: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    color: theme.colors.textMuted,
    letterSpacing: 0.8,
  },
  suggestName: {
    fontFamily: 'SpaceMono',
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginTop: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  dismissButton: {
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
  },
  dismissText: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    letterSpacing: 0.8,
  },
  acceptButton: {
    backgroundColor: theme.colors.accentPrimary,
  },
  acceptText: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
});
