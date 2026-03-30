import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TopicPicker } from './TopicPicker';
import { FieldPicker } from './FieldPicker';
import { theme } from '../constants/theme';

export interface SeriesConfig {
  topic: string;
  messageType: string;
  field: string;
  label: string;
  color: string;
}

const PALETTE = ['#4A9EFF', '#34D399', '#FBBF24', '#F472B6', '#A78BFA', '#FB923C'];

function defaultLabel(field: string): string {
  const parts = field.split('.');
  return parts.slice(-2).join('.');
}

interface Props {
  value: SeriesConfig[];
  onChange: (series: SeriesConfig[]) => void;
}

function SeriesRow({
  series,
  index,
  onUpdate,
  onRemove,
}: {
  series: SeriesConfig;
  index: number;
  onUpdate: (s: SeriesConfig) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(!series.topic);

  const summary = series.topic
    ? `${series.topic} › ${series.field || '—'}`
    : 'Unconfigured';

  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.rowHeader} onPress={() => setExpanded((e) => !e)}>
        <View style={[styles.colorDot, { backgroundColor: series.color }]} />
        <Text style={styles.rowSummary} numberOfLines={1}>{summary}</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={theme.colors.textMuted}
        />
        <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={16} color={theme.colors.statusError} />
        </TouchableOpacity>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.rowBody}>
          <Text style={styles.fieldLabel}>Topic</Text>
          <TopicPicker
            value={series.topic}
            onSelect={(topic) => onUpdate({ ...series, topic, field: '', messageType: '' })}
          />

          <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Field</Text>
          <FieldPicker
            topic={series.topic}
            value={series.field}
            onSelect={(field, messageType) =>
              onUpdate({
                ...series,
                field,
                messageType,
                label: series.label || defaultLabel(field),
              })
            }
          />

          <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Label (optional)</Text>
          <TextInput
            style={styles.textInput}
            value={series.label}
            onChangeText={(label) => onUpdate({ ...series, label })}
            placeholder={series.field ? defaultLabel(series.field) : 'Series label'}
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Color</Text>
          <View style={styles.colorRow}>
            {PALETTE.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.colorSwatch, { backgroundColor: c }, series.color === c && styles.colorSwatchActive]}
                onPress={() => onUpdate({ ...series, color: c })}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

export function SeriesEditor({ value, onChange }: Props) {
  const addSeries = () => {
    const color = PALETTE[value.length % PALETTE.length];
    onChange([...value, { topic: '', messageType: '', field: '', label: '', color }]);
  };

  return (
    <View style={styles.container}>
      {value.map((s, i) => (
        <SeriesRow
          key={i}
          series={s}
          index={i}
          onUpdate={(updated) => {
            const next = [...value];
            next[i] = updated;
            onChange(next);
          }}
          onRemove={() => onChange(value.filter((_, j) => j !== i))}
        />
      ))}
      <TouchableOpacity style={styles.addButton} onPress={addSeries}>
        <Ionicons name="add" size={16} color={theme.colors.accentPrimary} />
        <Text style={styles.addText}>ADD SERIES</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  row: {
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    backgroundColor: theme.colors.bgSurface,
  },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  rowSummary: {
    flex: 1,
    fontFamily: 'SpaceMono',
    fontSize: 11,
    color: theme.colors.textValue,
  },
  rowBody: {
    padding: 10,
    backgroundColor: theme.colors.bgElevated,
  },
  fieldLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  textInput: {
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    borderRadius: theme.radius.md,
    padding: 9,
    fontFamily: 'SpaceMono',
    fontSize: 12,
    color: theme.colors.textValue,
  },
  colorRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  colorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchActive: {
    borderColor: '#FFFFFF',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    borderRadius: theme.radius.md,
    borderStyle: 'dashed',
  },
  addText: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    color: theme.colors.accentPrimary,
    letterSpacing: 0.5,
  },
});
