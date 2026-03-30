// widgets/imu/DataPanels.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';


interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface DataPanelsProps {
  showAngularVelocity: boolean;
  showLinearAcceleration: boolean;
  showOrientationReadout: boolean;
  angularVelocity: Vec3 | null;
  linearAcceleration: Vec3 | null;
  rollDeg: number;
  pitchDeg: number;
  yawDeg: number;
}

const AXIS_COLORS = {
  x: '#ff4444',
  y: '#44ff44',
  z: '#4488ff',
};

function Vec3Panel({ label, data, unit }: { label: string; data: Vec3; unit: string }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelLabel}>{label}</Text>
      {(['x', 'y', 'z'] as const).map((axis) => (
        <View key={axis} style={styles.row}>
          <Text style={[styles.axis, { color: AXIS_COLORS[axis] }]}>{axis}:</Text>
          <Text style={styles.value}>{data[axis].toFixed(3)}</Text>
          <Text style={styles.unit}>{unit}</Text>
        </View>
      ))}
    </View>
  );
}

export function DataPanels({
  showAngularVelocity,
  showLinearAcceleration,
  showOrientationReadout,
  angularVelocity,
  linearAcceleration,
  rollDeg,
  pitchDeg,
  yawDeg,
}: DataPanelsProps) {
  return (
    <View style={styles.container}>
      {showAngularVelocity && angularVelocity && (
        <Vec3Panel label="Angular Velocity" data={angularVelocity} unit="rad/s" />
      )}
      {showLinearAcceleration && linearAcceleration && (
        <Vec3Panel label="Linear Acceleration" data={linearAcceleration} unit="m/s²" />
      )}
      {showOrientationReadout && (
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>Orientation (RPY)</Text>
          <View style={styles.rpyRow}>
            <View style={styles.rpyItem}>
              <Text style={styles.rpyValue}>{rollDeg.toFixed(1)}°</Text>
              <Text style={styles.rpyLabel}>R</Text>
            </View>
            <View style={styles.rpyItem}>
              <Text style={styles.rpyValue}>{pitchDeg.toFixed(1)}°</Text>
              <Text style={styles.rpyLabel}>P</Text>
            </View>
            <View style={styles.rpyItem}>
              <Text style={styles.rpyValue}>{yawDeg.toFixed(1)}°</Text>
              <Text style={styles.rpyLabel}>Y</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    minWidth: 130,
  },
  panel: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 6,
    padding: 8,
  },
  panelLabel: {
    fontFamily: 'SpaceMono',
    fontSize: 9,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginVertical: 1,
  },
  axis: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    width: 16,
  },
  value: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    color: '#fff',
    width: 62,
    textAlign: 'right',
  },
  unit: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    color: '#666',
  },
  rpyRow: {
    flexDirection: 'row',
    gap: 12,
  },
  rpyItem: {
    alignItems: 'center',
    width: 52,
  },
  rpyValue: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    color: '#fff',
    textAlign: 'center',
  },
  rpyLabel: {
    fontFamily: 'SpaceMono',
    fontSize: 9,
    color: '#666',
  },
});
