import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated as RNAnimated, Platform } from 'react-native';
import { useRosStore } from '../stores/useRosStore';
import { theme } from '../constants/theme';

export function ConnectionStatus() {
  const status = useRosStore((s) => s.connection.status);
  const error = useRosStore((s) => s.connection.error);
  const pulseAnim = useRef(new RNAnimated.Value(1)).current;
  const textOpacity = useRef(new RNAnimated.Value(1)).current;

  useEffect(() => {
    // Fade text on status change
    RNAnimated.sequence([
      RNAnimated.timing(textOpacity, { toValue: 0.3, duration: 80, useNativeDriver: true }),
      RNAnimated.timing(textOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    if (status === 'connecting') {
      const animation = RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(pulseAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          RNAnimated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else if (status === 'connected') {
      // Slow subtle glow for connected
      const animation = RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(pulseAnim, { toValue: 0.6, duration: 2000, useNativeDriver: true }),
          RNAnimated.timing(pulseAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status]);

  const dotColor = theme.statusColors[status] || theme.colors.statusDisconnected;

  const dotStyle = [
    styles.dot,
    {
      backgroundColor: dotColor,
      borderColor: dotColor + '80',
    },
    (status === 'connected' || status === 'connecting') && Platform.select({
      ios: {
        shadowColor: dotColor,
        shadowRadius: 6,
        shadowOpacity: 0.5,
        shadowOffset: { width: 0, height: 0 },
      },
      android: {
        filter: [{ dropShadow: { offsetX: 0, offsetY: 0, standardDeviation: 4, color: dotColor + '88' } }],
      },
    }),
  ];

  return (
    <View style={styles.container}>
      <RNAnimated.View style={[dotStyle, { opacity: pulseAnim }]} />
      <RNAnimated.Text style={[styles.text, { opacity: textOpacity }]} numberOfLines={1}>
        {status.toUpperCase()}
      </RNAnimated.Text>
      {error && <Text style={styles.error} numberOfLines={1}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  text: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: 'SpaceMono',
    letterSpacing: 0.8,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
  },
  error: {
    fontSize: 10,
    fontFamily: 'SpaceMono',
    color: theme.colors.statusError,
    flexShrink: 1,
  },
});
