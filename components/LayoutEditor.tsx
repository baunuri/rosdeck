import React, { useState } from 'react';
import { View, TouchableOpacity, Text, Modal, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useLayoutStore } from '../stores/useLayoutStore';
import { useOrientation } from '../hooks/useOrientation';
import { WidgetPicker } from './WidgetPicker';
import { WidgetSettings } from './WidgetSettings';
import { ConfirmDialog } from './ConfirmDialog';
import { getWidget } from '../widgets/registry';
import * as Haptics from '../lib/haptics';
import { theme } from '../constants/theme';

const MIN_PANE_SIZE = 150;

interface Props {
  nodeId: string;
  widgetType?: string;
  config?: Record<string, any>;
  onConfigChange?: (config: Record<string, any>) => void;
  // Parent split context for resize/swap
  parentSplitId?: string;
  parentDirection?: 'horizontal' | 'vertical';
  paneWidth: number;
  paneHeight: number;
}

export function LayoutEditor({
  nodeId, widgetType, config, onConfigChange,
  parentSplitId, parentDirection, paneWidth, paneHeight,
}: Props) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState<'split-h' | 'split-v' | 'swap' | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const widgetDef = widgetType ? getWidget(widgetType) : undefined;
  const splitPane = useLayoutStore((s) => s.splitPane);
  const removePane = useLayoutStore((s) => s.removePane);
  const swapWidget = useLayoutStore((s) => s.swapWidget);
  const { isLandscape } = useOrientation();

  // Check if splitting would create panes below minimum size
  const canSplitH = paneHeight / 2 >= MIN_PANE_SIZE; // horizontal split divides height
  const canSplitV = paneWidth / 2 >= MIN_PANE_SIZE; // vertical split divides width

  const hasConfig = widgetDef?.configSchema && widgetDef.configSchema.length > 0;

  const handleSplit = (direction: 'horizontal' | 'vertical') => {
    setMenuVisible(false);
    setPendingAction(direction === 'vertical' ? 'split-h' : 'split-v');
    setPickerVisible(true);
  };

  const handleSwapWidget = () => {
    setMenuVisible(false);
    setPendingAction('swap');
    setPickerVisible(true);
  };

  const handleWidgetSelect = (selectedType: string) => {
    if (pendingAction === 'split-h') {
      splitPane(nodeId, 'vertical', selectedType);
    } else if (pendingAction === 'split-v') {
      splitPane(nodeId, 'horizontal', selectedType);
    } else if (pendingAction === 'swap') {
      swapWidget(nodeId, selectedType);
    }
    setPickerVisible(false);
    setPendingAction(null);
  };

  return (
    <>
      {/* Edit mode: tap-anywhere overlay */}
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(150)}
        style={styles.overlay}
      >
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={0.8}
          onPress={() => { Haptics.selectionAsync(); setMenuVisible(true); }}
        >
          <View style={isLandscape ? styles.overlayContentRotated : undefined}>
            <Text style={styles.overlayName}>{widgetDef?.name?.toUpperCase() || 'WIDGET'}</Text>
            <Text style={styles.overlayHint}>TAP TO EDIT</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* Action menu */}
      <Modal visible={menuVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.menuContainer}>
            <Text style={styles.menuTitle}>
              {widgetDef?.name?.toUpperCase() || 'WIDGET'}
            </Text>

            {/* Split options — labels and icons swap in landscape since grid is rotated */}
            {canSplitH ? (
              <TouchableOpacity style={styles.menuItem} onPress={() => handleSplit('vertical')}>
                <Ionicons name={isLandscape ? "resize-outline" : "remove-outline"} size={18} color={theme.colors.textPrimary} />
                <Text style={styles.menuText}>{isLandscape ? 'Split Vertical' : 'Split Horizontal'}</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.menuItem, styles.menuItemDisabled]}>
                <Ionicons name={isLandscape ? "resize-outline" : "remove-outline"} size={18} color={theme.colors.textMuted} />
                <Text style={styles.menuTextDisabled}>{isLandscape ? 'Split Vertical' : 'Split Horizontal'}</Text>
                <Text style={styles.menuHint}>too small</Text>
              </View>
            )}

            {canSplitV ? (
              <TouchableOpacity style={styles.menuItem} onPress={() => handleSplit('horizontal')}>
                <Ionicons name={isLandscape ? "remove-outline" : "resize-outline"} size={18} color={theme.colors.textPrimary} />
                <Text style={styles.menuText}>{isLandscape ? 'Split Horizontal' : 'Split Vertical'}</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.menuItem, styles.menuItemDisabled]}>
                <Ionicons name={isLandscape ? "remove-outline" : "resize-outline"} size={18} color={theme.colors.textMuted} />
                <Text style={styles.menuTextDisabled}>{isLandscape ? 'Split Horizontal' : 'Split Vertical'}</Text>
                <Text style={styles.menuHint}>too small</Text>
              </View>
            )}

            <TouchableOpacity style={styles.menuItem} onPress={handleSwapWidget}>
              <Ionicons name="apps-outline" size={18} color={theme.colors.textPrimary} />
              <Text style={styles.menuText}>Change Widget</Text>
            </TouchableOpacity>

            {hasConfig && (
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); setSettingsVisible(true); }}>
                <Ionicons name="settings-outline" size={18} color={theme.colors.textPrimary} />
                <Text style={styles.menuText}>Configure</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => { setMenuVisible(false); setConfirmRemove(true); }}>
              <Ionicons name="trash-outline" size={18} color={theme.colors.statusError} />
              <Text style={[styles.menuText, { color: theme.colors.statusError }]}>Remove</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <WidgetPicker
        visible={pickerVisible}
        onSelect={handleWidgetSelect}
        onClose={() => { setPickerVisible(false); setPendingAction(null); }}
      />
      <ConfirmDialog
        visible={confirmRemove}
        title="Remove Widget"
        message="Remove this widget from the layout?"
        confirmLabel="REMOVE"
        onConfirm={() => { removePane(nodeId); setConfirmRemove(false); }}
        onCancel={() => setConfirmRemove(false)}
      />
      {widgetDef?.configSchema && (
        <WidgetSettings
          visible={settingsVisible}
          widgetName={widgetDef.name}
          configSchema={widgetDef.configSchema}
          config={config || {}}
          onConfigChange={(newConfig) => { onConfigChange?.(newConfig); }}
          onClose={() => setSettingsVisible(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0D0D0DBB',
    zIndex: 20,
  },
  overlayTouchable: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  overlayContentRotated: {
    transform: [{ rotate: '90deg' }],
    alignItems: 'center',
    gap: 6,
  },
  overlayName: {
    fontFamily: 'SpaceMono',
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  overlayHint: {
    fontFamily: 'SpaceMono',
    fontSize: 9,
    color: theme.colors.textMuted,
    letterSpacing: 0.8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000088',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  menuContainer: {
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    borderRadius: theme.radius.lg,
    width: '100%',
    maxWidth: 280,
    overflow: 'hidden',
  },
  menuTitle: {
    ...theme.typography.label,
    color: theme.colors.textMuted,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
    textAlign: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemDisabled: {
    opacity: 0.4,
  },
  menuText: {
    fontFamily: 'SpaceMono',
    fontSize: 13,
    color: theme.colors.textPrimary,
  },
  menuTextDisabled: {
    fontFamily: 'SpaceMono',
    fontSize: 13,
    color: theme.colors.textMuted,
    flex: 1,
  },
  menuHint: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    color: theme.colors.textMuted,
  },
});
