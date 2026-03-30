import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { theme } from '../constants/theme';

const MIN_SCALE = 0.6;
const MAX_SCALE = 2.0;
const STEP = 0.2;

interface Props {
  scale: number;
  onScaleChange: (scale: number) => void;
}

export function TextScaleControls({ scale, onScaleChange }: Props) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, scale <= MIN_SCALE && styles.disabled]}
        onPress={() => onScaleChange(Math.max(MIN_SCALE, scale - STEP))}
        disabled={scale <= MIN_SCALE}
      >
        <Text style={styles.buttonText}>A-</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, scale >= MAX_SCALE && styles.disabled]}
        onPress={() => onScaleChange(Math.min(MAX_SCALE, scale + STEP))}
        disabled={scale >= MAX_SCALE}
      >
        <Text style={styles.buttonText}>A+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 2,
  },
  button: {
    width: 28,
    height: 22,
    borderRadius: 3,
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontFamily: 'SpaceMono',
    fontSize: 9,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  disabled: {
    opacity: 0.3,
  },
});
