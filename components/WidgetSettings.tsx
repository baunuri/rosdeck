import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TextInput, Switch, TouchableOpacity, Modal, ScrollView, StyleSheet, Keyboard, TouchableWithoutFeedback, type LayoutChangeEvent, type GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WidgetConfigField } from '../types/layout';
import { TopicPicker } from './TopicPicker';
import { SeriesEditor } from './SeriesEditor';
import { theme } from '../constants/theme';

interface Props {
  visible: boolean;
  widgetName: string;
  configSchema: WidgetConfigField[];
  config: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
  onClose: () => void;
}

function NumberField({ field, value, onChange }: { field: WidgetConfigField; value: any; onChange: (v: any) => void }) {
  const [text, setText] = React.useState(String(value ?? ''));

  // Sync external value changes (e.g., from reset)
  React.useEffect(() => {
    const current = parseFloat(text);
    if (!isNaN(value) && value !== current) {
      setText(String(value));
    }
  }, [value]);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{field.label}</Text>
      <TextInput
        style={styles.textInput}
        value={text}
        onChangeText={(v) => {
          setText(v);
          // Only update config when we have a valid complete number
          const num = parseFloat(v);
          if (v !== '' && !isNaN(num) && !v.endsWith('.') && !v.endsWith('-')) {
            onChange(num);
          }
        }}
        onBlur={() => {
          const num = parseFloat(text);
          if (!isNaN(num)) {
            onChange(num);
            setText(String(num));
          } else if (text === '') {
            onChange(undefined);
          }
        }}
        keyboardType="decimal-pad"
        placeholderTextColor={theme.colors.textMuted}
      />
    </View>
  );
}

// ─── Slider Field ────────────────────────────────────────────────────────────

function SliderField({ field, value, onChange }: { field: WidgetConfigField; value: number; onChange: (v: number) => void }) {
  const min = field.min ?? 0;
  const max = field.max ?? 100;
  const step = field.step ?? 1;
  const trackRef = useRef<View>(null);
  const trackWidthRef = useRef(0);

  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const pct = ((value - min) / (max - min)) * 100;

  const handleTouch = (e: GestureResponderEvent) => {
    if (trackWidthRef.current <= 0) return;
    trackRef.current?.measureInWindow((x) => {
      const ratio = Math.max(0, Math.min(1, (e.nativeEvent.pageX - x) / trackWidthRef.current));
      onChange(clamp(min + ratio * (max - min)));
    });
  };

  return (
    <View style={sliderStyles.container}>
      <View style={sliderStyles.labelRow}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        <Text style={sliderStyles.valueText}>{value}{field.unit ? ` ${field.unit}` : ''}</Text>
      </View>
      <View
        ref={trackRef}
        style={sliderStyles.track}
        onLayout={(e: LayoutChangeEvent) => { trackWidthRef.current = e.nativeEvent.layout.width; }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
      >
        <View style={[sliderStyles.fill, { width: `${pct}%` as any }]} />
        <View style={[sliderStyles.thumb, { left: `${pct}%` as any }]} />
      </View>
      <View style={sliderStyles.rangeRow}>
        <Text style={sliderStyles.rangeText}>{min}</Text>
        <Text style={sliderStyles.rangeText}>{max}</Text>
      </View>
    </View>
  );
}

// ─── Axis Mapping Field ───────────────────────────────────────────────────────

const GROUP_OPTIONS = [
  { label: 'Linear', value: 'linear' },
  { label: 'Angular', value: 'angular' },
];
const COMPONENT_OPTIONS = [
  { label: 'X', value: 'x' },
  { label: 'Y', value: 'y' },
  { label: 'Z', value: 'z' },
];

function MiniSelect({ options, value, onChange }: {
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={axisStyles.miniRow}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt.value}
          style={[axisStyles.miniOption, value === opt.value && axisStyles.miniOptionActive]}
          onPress={() => onChange(opt.value)}
        >
          <Text style={[axisStyles.miniOptionText, value === opt.value && axisStyles.miniOptionTextActive]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ScaleInputPair({ leftValue, rightValue, onLeftChange, onRightChange }: {
  leftValue: number;
  rightValue: number;
  onLeftChange: (v: number) => void;
  onRightChange: (v: number) => void;
}) {
  const fmt = (n: number) => n.toFixed(2);
  const [leftText, setLeftText] = React.useState(fmt(leftValue));
  const [rightText, setRightText] = React.useState(fmt(rightValue));

  React.useEffect(() => { setLeftText(fmt(leftValue)); }, [leftValue]);
  React.useEffect(() => { setRightText(fmt(rightValue)); }, [rightValue]);

  const commit = (text: string, cb: (n: number) => void, reset: string, setFn: (s: string) => void) => {
    const n = parseFloat(text);
    if (!isNaN(n)) { cb(n); setFn(fmt(n)); } else { setFn(reset); }
  };

  const isValid = (v: string) => {
    if (v === '' || v === '-' || v.endsWith('.') || v.endsWith('-')) return false;
    return !isNaN(parseFloat(v));
  };

  return (
    <View style={axisStyles.scaleRow}>
      <TextInput
        style={axisStyles.scaleInput}
        value={leftText}
        onChangeText={(v) => { setLeftText(v); if (isValid(v)) onLeftChange(parseFloat(v)); }}
        onBlur={() => commit(leftText, onLeftChange, fmt(leftValue), setLeftText)}
        keyboardType="numbers-and-punctuation"
        placeholderTextColor={theme.colors.textMuted}
      />
      <View style={axisStyles.scaleLine}>
        {Array.from({ length: 9 }).map((_, i) => (
          <View key={i} style={[axisStyles.scaleTick, i === 4 && axisStyles.scaleCenterTick]} />
        ))}
      </View>
      <TextInput
        style={[axisStyles.scaleInput, { textAlign: 'right' }]}
        value={rightText}
        onChangeText={(v) => { setRightText(v); if (isValid(v)) onRightChange(parseFloat(v)); }}
        onBlur={() => commit(rightText, onRightChange, fmt(rightValue), setRightText)}
        keyboardType="numbers-and-punctuation"
        placeholderTextColor={theme.colors.textMuted}
      />
    </View>
  );
}

function AxisSection({ label, groupKey, componentKey, scaleKey, invertLeft, config, onChange }: {
  label: string;
  groupKey: string;
  componentKey: string;
  scaleKey: string;
  /** X-axis: invertLeft=false → leftVal=+scale, rightVal=-scale
   *  Y-axis: invertLeft=true  → leftVal=-scale, rightVal=+scale */
  invertLeft: boolean;
  config: Record<string, any>;
  onChange: (c: Record<string, any>) => void;
}) {
  const group: string = config[groupKey] ?? (label === 'X-Axis' ? 'angular' : 'linear');
  const component: string = config[componentKey] ?? (label === 'X-Axis' ? 'z' : 'x');
  const scale: number = config[scaleKey] ?? (label === 'X-Axis' ? 1.0 : 0.5);

  const leftVal = invertLeft ? -scale : scale;
  const rightVal = invertLeft ? scale : -scale;

  return (
    <View style={axisStyles.section}>
      <Text style={axisStyles.sectionHeader}>{label}</Text>

      <View style={axisStyles.axisRow}>
        <Text style={axisStyles.axisRowLabel}>Mapping</Text>
        <View style={axisStyles.selects}>
          <MiniSelect options={GROUP_OPTIONS} value={group}
            onChange={(v) => onChange({ ...config, [groupKey]: v })} />
          <MiniSelect options={COMPONENT_OPTIONS} value={component}
            onChange={(v) => onChange({ ...config, [componentKey]: v })} />
        </View>
      </View>

      <View style={axisStyles.axisRow}>
        <Text style={axisStyles.axisRowLabel}>Scale</Text>
        <View style={{ flex: 1 }}>
          <ScaleInputPair
            leftValue={leftVal}
            rightValue={rightVal}
            onLeftChange={(v) => onChange({ ...config, [scaleKey]: invertLeft ? -v : v })}
            onRightChange={(v) => onChange({ ...config, [scaleKey]: invertLeft ? v : -v })}
          />
        </View>
      </View>
    </View>
  );
}

function AxisMappingField({ config, onChange }: { config: Record<string, any>; onChange: (c: Record<string, any>) => void }) {
  return (
    <View>
      <AxisSection label="X-Axis" groupKey="xAxisGroup" componentKey="xAxisComponent" scaleKey="xAxisScale"
        invertLeft={false} config={config} onChange={onChange} />
      <AxisSection label="Y-Axis" groupKey="yAxisGroup" componentKey="yAxisComponent" scaleKey="yAxisScale"
        invertLeft={true} config={config} onChange={onChange} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function WidgetSettings({ visible, widgetName, configSchema, config, onConfigChange, onClose }: Props) {
  const [draft, setDraft] = useState(config);

  // Sync draft from prop when modal opens. config is intentionally omitted
  // from deps — we don't want external changes to clobber in-progress edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (visible) setDraft(config); }, [visible]);

  const updateDraft = (key: string, value: any) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  const handleClose = () => {
    onConfigChange(draft);
    onClose();
  };

  const renderField = (field: WidgetConfigField) => {
    if (field.visibleWhen && draft[field.visibleWhen.key] !== field.visibleWhen.value) {
      return null;
    }
    switch (field.type) {
      case 'topic':
        return (
          <View key={field.key} style={styles.field}>
            <Text style={styles.fieldLabel}>{field.label}</Text>
            <TopicPicker
              value={draft[field.key] || ''}
              filterMessageTypes={field.topicMessageTypes}
              onSelect={(topic) => updateDraft(field.key, topic)}
            />
          </View>
        );

      case 'text':
        return (
          <View key={field.key} style={styles.field}>
            <Text style={styles.fieldLabel}>{field.label}</Text>
            <TextInput
              style={styles.textInput}
              value={String(draft[field.key] || '')}
              onChangeText={(v) => updateDraft(field.key, v)}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={field.placeholder}
              placeholderTextColor={theme.colors.textMuted}
            />
          </View>
        );

      case 'number':
        return <NumberField key={field.key} field={field} value={draft[field.key]} onChange={(v) => updateDraft(field.key, v)} />;


      case 'boolean':
        return (
          <View key={field.key} style={styles.switchRow}>
            <Text style={styles.fieldLabel}>{field.label}</Text>
            <Switch
              value={!!draft[field.key]}
              onValueChange={(v) => updateDraft(field.key, v)}
              trackColor={{ false: theme.colors.borderDefault, true: theme.colors.accentPrimary }}
              thumbColor="#FFFFFF"
            />
          </View>
        );

      case 'select':
        return (
          <View key={field.key} style={styles.field}>
            <Text style={styles.fieldLabel}>{field.label}</Text>
            <View style={styles.selectRow}>
              {field.options?.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.selectOption,
                    draft[field.key] === opt.value && styles.selectOptionActive,
                  ]}
                  onPress={() => updateDraft(field.key, opt.value)}
                >
                  <Text style={[
                    styles.selectText,
                    draft[field.key] === opt.value && styles.selectTextActive,
                  ]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      case 'series-editor':
        return (
          <View key={field.key} style={styles.field}>
            <Text style={styles.fieldLabel}>{field.label}</Text>
            <SeriesEditor
              value={draft[field.key] ?? []}
              onChange={(series) => updateDraft(field.key, series)}
            />
          </View>
        );

      case 'slider':
        return <SliderField key={field.key} field={field} value={draft[field.key] ?? field.min ?? 0} onChange={(v) => updateDraft(field.key, v)} />;

      case 'axis-mapping':
        return <AxisMappingField key={field.key} config={draft} onChange={setDraft} />;

      default:
        return null;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>{widgetName.toUpperCase()} SETTINGS</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
              {configSchema.map(renderField)}
            </ScrollView>
          </TouchableWithoutFeedback>
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
    maxHeight: '80%',
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
  contentContainer: {
    paddingBottom: 24,
  },
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  textInput: {
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    borderRadius: theme.radius.md,
    padding: 10,
    fontFamily: 'SpaceMono',
    fontSize: 13,
    color: theme.colors.textValue,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 4,
  },
  selectRow: {
    flexDirection: 'row',
    gap: 8,
  },
  selectOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    borderRadius: theme.radius.md,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectOptionActive: {
    backgroundColor: theme.colors.accentPrimary,
    borderColor: theme.colors.accentPrimary,
  },
  selectText: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  selectTextActive: {
    color: '#FFFFFF',
  },
});

const axisStyles = StyleSheet.create({
  section: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: theme.radius.md,
    padding: 10,
  },
  sectionHeader: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    color: theme.colors.accentPrimary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  axisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  axisRowLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    width: 54,
  },
  selects: {
    flex: 1,
    flexDirection: 'column',
    gap: 4,
  },
  miniRow: {
    flexDirection: 'row',
    gap: 4,
  },
  miniOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    borderRadius: theme.radius.sm,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniOptionActive: {
    backgroundColor: theme.colors.accentPrimary,
    borderColor: theme.colors.accentPrimary,
  },
  miniOptionText: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  miniOptionTextActive: {
    color: '#FFFFFF',
  },
  scaleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scaleInput: {
    width: 54,
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 5,
    fontFamily: 'SpaceMono',
    fontSize: 11,
    color: theme.colors.textValue,
    textAlign: 'center',
  },
  scaleLine: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scaleTick: {
    width: 1,
    height: 6,
    backgroundColor: theme.colors.borderDefault,
  },
  scaleCenterTick: {
    height: 12,
    backgroundColor: theme.colors.textMuted,
  },
});

const sliderStyles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  valueText: {
    fontFamily: 'SpaceMono',
    fontSize: 13,
    color: theme.colors.textValue,
    fontWeight: '700',
  },
  track: {
    height: 6,
    backgroundColor: theme.colors.bgSurface,
    borderRadius: 3,
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: theme.colors.accentPrimary,
    borderRadius: 3,
  },
  thumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: theme.colors.accentPrimary,
    marginLeft: -9,
    top: -6,
  },
  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  rangeText: {
    fontFamily: 'SpaceMono',
    fontSize: 9,
    color: theme.colors.textMuted,
  },
});
