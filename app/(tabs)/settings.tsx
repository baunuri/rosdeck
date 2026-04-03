import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useRosStore } from '../../stores/useRosStore';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { usePresetsStore } from '../../stores/usePresetsStore';
import { useOnboardingStore } from '../../stores/useOnboardingStore';
import { SetupGuide } from '../../components/SetupGuide';
import { useOrientation } from '../../hooks/useOrientation';
import { theme } from '../../constants/theme';

const PUBLISH_RATE_OPTIONS = [5, 10, 20, 30];
const DEPTH_OPTIONS = [4, 6, 8, 12];
const ARRAY_LIMIT_OPTIONS = [8, 16, 32, 64];
const DEADZONE_OPTIONS = [0.05, 0.1, 0.15, 0.2, 0.3];

export default function SettingsScreen() {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const keepAwake = useSettingsStore((s) => s.keepAwake);
  const publishRateHz = useSettingsStore((s) => s.publishRateHz);
  const autoDetectTopics = useSettingsStore((s) => s.autoDetectTopics);
  const fieldPickerDepth = useSettingsStore((s) => s.fieldPickerDepth);
  const fieldPickerArrayLimit = useSettingsStore((s) => s.fieldPickerArrayLimit);
  const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled);
  const setKeepAwake = useSettingsStore((s) => s.setKeepAwake);
  const setPublishRateHz = useSettingsStore((s) => s.setPublishRateHz);
  const setAutoDetectTopics = useSettingsStore((s) => s.setAutoDetectTopics);
  const setFieldPickerDepth = useSettingsStore((s) => s.setFieldPickerDepth);
  const setFieldPickerArrayLimit = useSettingsStore((s) => s.setFieldPickerArrayLimit);
  const tabRailSide = useSettingsStore((s) => s.tabRailSide);
  const setTabRailSide = useSettingsStore((s) => s.setTabRailSide);
  const gamepadDeadzone = useSettingsStore((s) => s.gamepadDeadzone);
  const setGamepadDeadzone = useSettingsStore((s) => s.setGamepadDeadzone);
  const gamepadAutoLayout = useSettingsStore((s) => s.gamepadAutoLayout);
  const setGamepadAutoLayout = useSettingsStore((s) => s.setGamepadAutoLayout);

  const robotUrl = useLayoutStore((s) => s.robotUrl);
  const [showGuide, setShowGuide] = React.useState(false);

  const handleResetLayouts = () => {
    if (!robotUrl) return;
    Alert.alert(
      'Reset Layouts',
      'This will restore all layouts for the current robot to defaults. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem(`ros2mobile_layouts_${robotUrl}`);
            useLayoutStore.getState().reset();
          },
        },
      ],
    );
  };

  const handleClearConnections = () => {
    Alert.alert(
      'Clear Saved Connections',
      'All saved robot connections will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            useRosStore.getState().disconnect();
            await AsyncStorage.setItem('ros2mobile_saved_connections', '[]');
            useRosStore.setState({ savedConnections: [] });
          },
        },
      ],
    );
  };

  const handleResetAll = () => {
    Alert.alert(
      'Reset All App Data',
      'This will erase all saved connections, layouts, presets, and settings. The app will return to its initial state.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything',
          style: 'destructive',
          onPress: async () => {
            try {
              const allKeys = await AsyncStorage.getAllKeys();
              const layoutKeys = allKeys.filter((k) =>
                k.startsWith('ros2mobile_layouts_'),
              );
              await AsyncStorage.multiRemove([
                'ros2mobile_settings',
                'ros2mobile_saved_connections',
                'ros2mobile_global_presets',
                'ros2mobile_onboarding',
                ...layoutKeys,
              ]);
            } catch {}
            useRosStore.getState().disconnect();
            useRosStore.setState({ savedConnections: [] });
            useLayoutStore.getState().reset();
            usePresetsStore.setState({ presets: [], loaded: false });
            useOnboardingStore.getState().reset();
            useSettingsStore.setState({ hapticsEnabled: true, keepAwake: true, publishRateHz: 10, autoDetectTopics: true, tabRailSide: 'left', loaded: false });
          },
        },
      ],
    );
  };

  const { isLandscape } = useOrientation();

  const preferencesSection = (
    <>
      <Text style={styles.sectionTitle}>PREFERENCES</Text>
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleLabel}>
            <Text style={styles.rowTitle}>Haptics</Text>
          </View>
          <Switch
            value={hapticsEnabled}
            onValueChange={setHapticsEnabled}
            trackColor={{ false: theme.colors.borderSubtle, true: theme.colors.accentPrimary }}
            thumbColor={theme.colors.textPrimary}
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.toggleRow}>
          <View style={styles.toggleLabel}>
            <Text style={styles.rowTitle}>Keep Screen Awake</Text>
            <Text style={styles.rowSubtitle}>Prevents dimming while connected</Text>
          </View>
          <Switch
            value={keepAwake}
            onValueChange={setKeepAwake}
            trackColor={{ false: theme.colors.borderSubtle, true: theme.colors.accentPrimary }}
            thumbColor={theme.colors.textPrimary}
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.toggleRow}>
          <View style={styles.toggleLabel}>
            <Text style={styles.rowTitle}>Auto-detect Topics</Text>
            <Text style={styles.rowSubtitle}>Automatically discover and subscribe to topics</Text>
          </View>
          <Switch
            value={autoDetectTopics}
            onValueChange={setAutoDetectTopics}
            trackColor={{ false: theme.colors.borderSubtle, true: theme.colors.accentPrimary }}
            thumbColor={theme.colors.textPrimary}
          />
        </View>
        <View style={styles.divider} />
        <Text style={styles.rowTitle}>Tab Bar Side (Landscape)</Text>
        <Text style={styles.rowSubtitle}>Which side the tab rail appears on in landscape mode</Text>
        <View style={styles.segmentedRow}>
          {(['left', 'right'] as const).map((side) => (
            <TouchableOpacity
              key={side}
              style={[
                styles.segmentButton,
                tabRailSide === side && styles.segmentButtonActive,
              ]}
              onPress={() => setTabRailSide(side)}
            >
              <Text
                style={[
                  styles.segmentText,
                  tabRailSide === side && styles.segmentTextActive,
                ]}
              >
                {side.charAt(0).toUpperCase() + side.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Text style={styles.sectionTitle}>CONTROL</Text>
      <View style={styles.card}>
        <Text style={styles.rowTitle}>Joystick Publish Rate</Text>
        <Text style={styles.rowSubtitle}>How often commands are sent to the robot</Text>
        <View style={styles.segmentedRow}>
          {PUBLISH_RATE_OPTIONS.map((rate) => (
            <TouchableOpacity
              key={rate}
              style={[
                styles.segmentButton,
                publishRateHz === rate && styles.segmentButtonActive,
              ]}
              onPress={() => setPublishRateHz(rate)}
            >
              <Text
                style={[
                  styles.segmentText,
                  publishRateHz === rate && styles.segmentTextActive,
                ]}
              >
                {rate} Hz
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Text style={styles.sectionTitle}>GAMEPAD</Text>
      <View style={styles.card}>
        <Text style={styles.rowTitle}>Auto Stick Layout</Text>
        <Text style={styles.rowSubtitle}>Which stick does what when a single joystick widget is used</Text>
        <View style={styles.segmentedRow}>
          {([
            { value: 'left-drive' as const, label: 'L Drive · R Steer' },
            { value: 'left-steer' as const, label: 'L Steer · R Drive' },
          ]).map(({ value, label }) => (
            <TouchableOpacity
              key={value}
              style={[
                styles.segmentButton,
                gamepadAutoLayout === value && styles.segmentButtonActive,
              ]}
              onPress={() => setGamepadAutoLayout(value)}
            >
              <Text
                style={[
                  styles.segmentText,
                  gamepadAutoLayout === value && styles.segmentTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.divider} />
        <Text style={styles.rowTitle}>Stick Deadzone</Text>
        <Text style={styles.rowSubtitle}>Ignore small stick movements (noise filtering)</Text>
        <View style={styles.segmentedRow}>
          {DEADZONE_OPTIONS.map((dz) => (
            <TouchableOpacity
              key={dz}
              style={[
                styles.segmentButton,
                gamepadDeadzone === dz && styles.segmentButtonActive,
              ]}
              onPress={() => setGamepadDeadzone(dz)}
            >
              <Text
                style={[
                  styles.segmentText,
                  gamepadDeadzone === dz && styles.segmentTextActive,
                ]}
              >
                {dz}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </>
  );

  const fieldPickerSection = (
    <>
      <Text style={styles.sectionTitle}>FIELD PICKER</Text>
      <View style={styles.card}>
        <Text style={styles.rowTitle}>Max Nesting Depth</Text>
        <Text style={styles.rowSubtitle}>How deep to traverse message fields</Text>
        <View style={styles.segmentedRow}>
          {DEPTH_OPTIONS.map((d) => (
            <TouchableOpacity
              key={d}
              style={[
                styles.segmentButton,
                fieldPickerDepth === d && styles.segmentButtonActive,
              ]}
              onPress={() => setFieldPickerDepth(d)}
            >
              <Text
                style={[
                  styles.segmentText,
                  fieldPickerDepth === d && styles.segmentTextActive,
                ]}
              >
                {d}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.divider} />
        <Text style={styles.rowTitle}>Array Element Limit</Text>
        <Text style={styles.rowSubtitle}>Max array elements to scan per level</Text>
        <View style={styles.segmentedRow}>
          {ARRAY_LIMIT_OPTIONS.map((n) => (
            <TouchableOpacity
              key={n}
              style={[
                styles.segmentButton,
                fieldPickerArrayLimit === n && styles.segmentButtonActive,
              ]}
              onPress={() => setFieldPickerArrayLimit(n)}
            >
              <Text
                style={[
                  styles.segmentText,
                  fieldPickerArrayLimit === n && styles.segmentTextActive,
                ]}
              >
                {n}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </>
  );

  const dataSection = (
    <>
      <Text style={styles.sectionTitle}>DATA</Text>
      <View style={styles.card}>
        <TouchableOpacity
          style={[styles.actionRow, !robotUrl && styles.actionRowDisabled]}
          onPress={handleResetLayouts}
          disabled={!robotUrl}
        >
          <Ionicons
            name="refresh-outline"
            size={16}
            color={robotUrl ? theme.colors.statusError : theme.colors.textMuted}
          />
          <Text style={[styles.actionText, styles.actionTextDestructive, !robotUrl && styles.actionTextDisabled]}>
            Reset Layouts for This Robot
          </Text>
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.actionRow} onPress={handleClearConnections}>
          <Ionicons name="wifi-outline" size={16} color={theme.colors.statusError} />
          <Text style={[styles.actionText, styles.actionTextDestructive]}>
            Clear Saved Connections
          </Text>
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.actionRow} onPress={handleResetAll}>
          <Ionicons name="trash-outline" size={16} color={theme.colors.statusError} />
          <Text style={[styles.actionText, styles.actionTextDestructive]}>
            Reset All App Data
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>ABOUT</Text>
      <View style={styles.card}>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Version</Text>
          <Text style={styles.value}>
            {Constants.expoConfig?.version || '1.0.0'}
            {' '}
            <Text style={styles.buildNumber}>
              ({Constants.expoConfig?.android?.versionCode ?? Constants.expoConfig?.ios?.buildNumber ?? '?'})
            </Text>
          </Text>
        </View>
        <TouchableOpacity style={styles.actionRow} onPress={() => setShowGuide(true)}>
          <Ionicons name="book-outline" size={16} color={theme.colors.accentPrimary} />
          <Text style={styles.actionText}>Setup Guide</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.container} edges={isLandscape ? [] : ['top']}>
      {isLandscape ? (
        <View style={styles.landscapeRow}>
          <ScrollView style={styles.landscapeColumn} contentContainerStyle={styles.landscapeColumnContent}>
            {preferencesSection}
          </ScrollView>
          <ScrollView style={styles.landscapeColumn} contentContainerStyle={styles.landscapeColumnContent}>
            {fieldPickerSection}
            {dataSection}
          </ScrollView>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {preferencesSection}
          {fieldPickerSection}
          {dataSection}
        </ScrollView>
      )}
      <SetupGuide visible={showGuide} onClose={() => setShowGuide(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgBase,
  },
  scrollView: {
    padding: 20,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  landscapeRow: {
    flex: 1,
    flexDirection: 'row',
  },
  landscapeColumn: {
    flex: 1,
    padding: 16,
  },
  landscapeColumnContent: {
    paddingBottom: 40,
  },
  sectionTitle: {
    ...theme.typography.label,
    color: theme.colors.textMuted,
    marginTop: 16,
    marginBottom: 8,
  },
  card: {
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: theme.radius.lg,
    padding: 16,
    marginBottom: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  toggleLabel: {
    flex: 1,
    paddingRight: 12,
  },
  rowTitle: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontWeight: '500',
  },
  rowSubtitle: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.borderSubtle,
    marginVertical: 10,
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
  },
  segmentButtonActive: {
    backgroundColor: theme.colors.accentPrimary,
    borderColor: theme.colors.accentPrimary,
  },
  segmentText: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  segmentTextActive: {
    color: '#000',
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  actionRowDisabled: {
    opacity: 0.4,
  },
  actionText: {
    fontFamily: 'SpaceMono',
    fontSize: 13,
    color: theme.colors.accentPrimary,
  },
  actionTextDestructive: {
    color: theme.colors.statusError,
  },
  actionTextDisabled: {
    color: theme.colors.textMuted,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  label: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  value: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontWeight: '500',
  },
  buildNumber: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: '400',
  },
});
