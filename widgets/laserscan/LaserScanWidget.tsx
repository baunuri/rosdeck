import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Canvas, Points, vec } from '@shopify/react-native-skia';
import { useRosStore } from '../../stores/useRosStore';
import { laserScanToPoints } from './transforms';
import { theme } from '../../constants/theme';
import type { WidgetProps } from '../../types/layout';
import { WidgetEmptyState } from '../../components/WidgetEmptyState';

export function LaserScanWidget(props: Partial<WidgetProps>) {
  const transport = useRosStore((s) => s.transport);
  const status = useRosStore((s) => s.connection.status);
  const topic = props?.config?.topic || '/scan';
  const pointColor = props?.config?.pointColor || theme.colors.accentPrimary;
  const maxRange = props?.config?.maxRange || 10;

  const [points, setPoints] = useState<[number, number][]>([]);
  const [showEmptyState, setShowEmptyState] = useState(false);

  useEffect(() => {
    if (!transport || status !== 'connected') return;
    const sub = transport.subscribe(topic, 'sensor_msgs/msg/LaserScan', (msg: any) => {
      const pts = laserScanToPoints({
        angle_min: msg.angle_min || 0,
        angle_increment: msg.angle_increment || 0,
        range_min: msg.range_min || 0,
        range_max: msg.range_max || maxRange,
        ranges: msg.ranges || [],
      });
      setPoints(pts);
    });
    return () => sub.unsubscribe();
  }, [transport, status, topic, maxRange]);

  const hasData = points.length > 0;

  useEffect(() => {
    if (status === 'connected' && !hasData) {
      const timer = setTimeout(() => setShowEmptyState(true), 3000);
      return () => clearTimeout(timer);
    }
    setShowEmptyState(false);
  }, [status, hasData]);

  const width = props?.width || 300;
  const height = props?.height || 300;
  const centerX = width / 2;
  const centerY = height / 2;
  const pixelsPerMeter = Math.min(width, height) / (2 * maxRange);

  if (status !== 'connected' || (showEmptyState && !hasData)) {
    return (
      <View style={[styles.container, { width, height }]}>
        {showEmptyState && status === 'connected' ? (
          <WidgetEmptyState widgetType="laserscan" topicName={topic} />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Not connected</Text>
          </View>
        )}
      </View>
    );
  }

  const skiaPoints = points.map(([x, y]) =>
    vec(centerX + x * pixelsPerMeter, centerY - y * pixelsPerMeter)
  );

  return (
    <View style={[styles.container, { width, height }]}>
      <Canvas style={StyleSheet.absoluteFill}>
        {skiaPoints.length > 0 && (
          <Points points={skiaPoints} mode="points" color={pointColor} strokeWidth={2} />
        )}
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#000', overflow: 'hidden' },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholderText: { fontFamily: 'SpaceMono', fontSize: 12, color: theme.colors.textMuted },
});
