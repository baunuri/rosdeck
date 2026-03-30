// components/LayoutManager.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLayoutStore } from '../stores/useLayoutStore';
import { usePresetsStore } from '../stores/usePresetsStore';
import { createWidgetNode } from '../types/layout';
import { ConfirmDialog } from './ConfirmDialog';
import { theme } from '../constants/theme';

export function LayoutManager() {
  const layouts = useLayoutStore((s) => s.layouts);
  const activeLayoutId = useLayoutStore((s) => s.activeLayoutId);
  const editMode = useLayoutStore((s) => s.editMode);
  const setActiveLayout = useLayoutStore((s) => s.setActiveLayout);
  const setEditMode = useLayoutStore((s) => s.setEditMode);
  const addLayout = useLayoutStore((s) => s.addLayout);
  const removeLayout = useLayoutStore((s) => s.removeLayout);
  const renameLayout = useLayoutStore((s) => s.renameLayout);

  const presets = usePresetsStore((s) => s.presets);
  const loadPresets = usePresetsStore((s) => s.load);
  const savePreset = usePresetsStore((s) => s.savePreset);
  const removePreset = usePresetsStore((s) => s.removePreset);

  const [listVisible, setListVisible] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  // New layout flow: 'name' = choosing name, 'preset' = picking a preset
  const [addStep, setAddStep] = useState<'none' | 'name' | 'preset'>('none');
  const [newLayoutName, setNewLayoutName] = useState('');

  // Preset management
  const [presetsVisible, setPresetsVisible] = useState(false);
  const [confirmDeletePreset, setConfirmDeletePreset] = useState<string | null>(null);
  // Save-as-preset dialog
  const [savePresetFor, setSavePresetFor] = useState<{ id: string; name: string; tree: any } | null>(null);
  const [savePresetName, setSavePresetName] = useState('');

  useEffect(() => {
    if (listVisible || presetsVisible) loadPresets();
  }, [listVisible, presetsVisible]);

  const activeLayout = layouts.find((l) => l.id === activeLayoutId);

  function startRename(id: string, currentName: string) {
    setRenamingId(id);
    setRenameText(currentName);
  }

  function commitRename() {
    if (renamingId && renameText.trim()) {
      renameLayout(renamingId, renameText.trim());
    }
    setRenamingId(null);
    setRenameText('');
  }

  function handleSaveAsPreset(layout: { id: string; name: string; tree: any }) {
    setSavePresetFor(layout);
    setSavePresetName(layout.name);
  }

  function commitSavePreset() {
    if (savePresetFor && savePresetName.trim()) {
      savePreset(savePresetName.trim(), savePresetFor.tree);
    }
    setSavePresetFor(null);
    setSavePresetName('');
  }

  function handleAddBlank() {
    if (!newLayoutName.trim()) return;
    addLayout(newLayoutName.trim(), createWidgetNode('joystick', {}));
    setAddStep('none');
    setNewLayoutName('');
    setListVisible(false);
  }

  function handleAddFromPreset(preset: { id: string; name: string; tree: any }) {
    const name = newLayoutName.trim() || preset.name;
    addLayout(name, preset.tree);
    setAddStep('none');
    setNewLayoutName('');
    setListVisible(false);
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.selector} onPress={() => setListVisible(true)}>
        <Ionicons name="grid-outline" size={14} color={theme.colors.textSecondary} />
        <Text style={styles.selectorText}>{activeLayout?.name || 'Layout'}</Text>
        <Ionicons name="chevron-down" size={14} color={theme.colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.editButton, editMode && styles.editButtonActive]}
        onPress={() => setEditMode(!editMode)}
      >
        <Ionicons
          name={editMode ? 'checkmark' : 'pencil-outline'}
          size={14}
          color={editMode ? '#FFFFFF' : theme.colors.textSecondary}
        />
        <Text style={[styles.editText, editMode && styles.editTextActive]}>
          {editMode ? 'Done' : 'Edit'}
        </Text>
      </TouchableOpacity>

      {/* ── Layout list modal ── */}
      <Modal visible={listVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            if (addStep !== 'none') { setAddStep('none'); setNewLayoutName(''); return; }
            if (renamingId) { commitRename(); return; }
            setListVisible(false);
          }}
        >
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>LAYOUTS</Text>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  onPress={() => { setPresetsVisible(true); setListVisible(false); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ marginRight: 12 }}
                >
                  <Ionicons name="bookmark-outline" size={20} color={theme.colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setAddStep('name')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="add" size={22} color={theme.colors.accentPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Add layout: name step */}
            {addStep === 'name' && (
              <View style={styles.addPane}>
                <TextInput
                  style={styles.addInput}
                  value={newLayoutName}
                  onChangeText={setNewLayoutName}
                  placeholder="Layout name"
                  placeholderTextColor={theme.colors.textMuted}
                  autoFocus
                  onSubmitEditing={handleAddBlank}
                />
                <View style={styles.addActions}>
                  <TouchableOpacity style={styles.addBtn} onPress={handleAddBlank}>
                    <Ionicons name="square-outline" size={14} color={theme.colors.textSecondary} />
                    <Text style={styles.addBtnText}>Blank</Text>
                  </TouchableOpacity>
                  {presets.length > 0 && (
                    <TouchableOpacity style={styles.addBtn} onPress={() => setAddStep('preset')}>
                      <Ionicons name="bookmark-outline" size={14} color={theme.colors.accentPrimary} />
                      <Text style={[styles.addBtnText, { color: theme.colors.accentPrimary }]}>
                        From preset
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {/* Add layout: preset picker step */}
            {addStep === 'preset' && (
              <ScrollView>
                <TouchableOpacity style={styles.backRow} onPress={() => setAddStep('name')}>
                  <Ionicons name="chevron-back" size={14} color={theme.colors.textMuted} />
                  <Text style={styles.backText}>Choose preset</Text>
                </TouchableOpacity>
                {presets.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.layoutItem}
                    onPress={() => handleAddFromPreset(p)}
                  >
                    <Text style={styles.layoutName}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Layout list */}
            {addStep === 'none' && (
              <ScrollView>
                {layouts.map((layout) => (
                  <View
                    key={layout.id}
                    style={[
                      styles.layoutItem,
                      layout.id === activeLayoutId && styles.layoutItemActive,
                    ]}
                  >
                    {renamingId === layout.id ? (
                      <TextInput
                        style={styles.renameInput}
                        value={renameText}
                        onChangeText={setRenameText}
                        onSubmitEditing={commitRename}
                        onBlur={commitRename}
                        autoFocus
                      />
                    ) : (
                      <TouchableOpacity
                        style={{ flex: 1 }}
                        onPress={() => { setActiveLayout(layout.id); setListVisible(false); }}
                      >
                        <Text style={[
                          styles.layoutName,
                          layout.id === activeLayoutId && styles.layoutNameActive,
                        ]}>
                          {layout.name}
                        </Text>
                      </TouchableOpacity>
                    )}

                    <View style={styles.rowActions}>
                      <TouchableOpacity
                        onPress={() => startRename(layout.id, layout.name)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="pencil-outline" size={15} color={theme.colors.textMuted} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleSaveAsPreset(layout)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="bookmark-outline" size={15} color={theme.colors.textMuted} />
                      </TouchableOpacity>
                      {layouts.length > 1 && (
                        <TouchableOpacity
                          onPress={() => setConfirmDelete(layout.id)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="trash-outline" size={15} color={theme.colors.textMuted} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Presets modal ── */}
      <Modal visible={presetsVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setPresetsVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>SAVED PRESETS</Text>
              <TouchableOpacity onPress={() => { setPresetsVisible(false); setListVisible(true); }}>
                <Ionicons name="close" size={20} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>
            {presets.length === 0 ? (
              <View style={styles.emptyPresets}>
                <Text style={styles.emptyPresetsText}>
                  No presets yet. Save a layout using the{' '}
                  <Ionicons name="bookmark-outline" size={11} color={theme.colors.textMuted} />
                  {' '}icon.
                </Text>
              </View>
            ) : (
              <ScrollView>
                {presets.map((p) => (
                  <View key={p.id} style={styles.layoutItem}>
                    <Text style={styles.layoutName}>{p.name}</Text>
                    <TouchableOpacity
                      onPress={() => setConfirmDeletePreset(p.id)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="trash-outline" size={15} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Save as preset dialog ── */}
      <Modal visible={savePresetFor !== null} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSavePresetFor(null)}>
          <View style={[styles.modalContent, { maxHeight: undefined }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>SAVE AS PRESET</Text>
            </View>
            <View style={styles.addPane}>
              <TextInput
                style={styles.addInput}
                value={savePresetName}
                onChangeText={setSavePresetName}
                placeholder="Preset name"
                placeholderTextColor={theme.colors.textMuted}
                autoFocus
                onSubmitEditing={commitSavePreset}
              />
              <TouchableOpacity style={styles.savePresetBtn} onPress={commitSavePreset}>
                <Ionicons name="bookmark" size={16} color="#FFFFFF" />
                <Text style={styles.savePresetBtnText}>Save Preset</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <ConfirmDialog
        visible={confirmDelete !== null}
        title="Delete Layout"
        message="Are you sure you want to delete this layout?"
        onConfirm={() => { if (confirmDelete) removeLayout(confirmDelete); setConfirmDelete(null); }}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmDialog
        visible={confirmDeletePreset !== null}
        title="Delete Preset"
        message="Remove this preset?"
        onConfirm={() => { if (confirmDeletePreset) removePreset(confirmDeletePreset); setConfirmDeletePreset(null); }}
        onCancel={() => setConfirmDeletePreset(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: theme.radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  selectorText: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: theme.radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  editButtonActive: {
    backgroundColor: theme.colors.accentPrimary,
    borderColor: theme.colors.accentPrimary,
  },
  editText: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editTextActive: {
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000088',
    justifyContent: 'center',
    padding: 40,
  },
  modalContent: {
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    borderRadius: theme.radius.lg,
    maxHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    ...theme.typography.label,
    color: theme.colors.textSecondary,
  },
  layoutItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  layoutItemActive: {
    backgroundColor: theme.colors.accentPrimaryMuted,
  },
  layoutName: {
    fontFamily: 'SpaceMono',
    fontSize: 14,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  layoutNameActive: {
    color: theme.colors.accentPrimary,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  renameInput: {
    flex: 1,
    fontFamily: 'SpaceMono',
    fontSize: 14,
    color: theme.colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.accentPrimary,
    paddingVertical: 2,
    marginRight: 8,
  },
  addPane: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
    gap: 10,
  },
  addInput: {
    fontFamily: 'SpaceMono',
    fontSize: 13,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  addActions: {
    flexDirection: 'row',
    gap: 10,
  },
  addBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    borderRadius: theme.radius.sm,
  },
  addBtnText: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  backText: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyPresets: {
    padding: 24,
    alignItems: 'center',
  },
  savePresetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.accentPrimary,
    borderRadius: theme.radius.sm,
    paddingVertical: 12,
  },
  savePresetBtnText: {
    fontFamily: 'SpaceMono',
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  emptyPresetsText: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
