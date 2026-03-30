import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { theme } from '../constants/theme';

interface Props {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ visible, title, message, confirmLabel = 'DELETE', confirmColor = theme.colors.statusError, onConfirm, onCancel }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.buttons}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.confirmButton, { backgroundColor: confirmColor }]} onPress={onConfirm}>
              <Text style={styles.confirmText}>{confirmLabel}</Text>
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
    backgroundColor: '#00000088',
    justifyContent: 'center',
    padding: 40,
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
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  message: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 18,
    marginBottom: 20,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelText: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
  },
  confirmButton: {
    flex: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  confirmText: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
