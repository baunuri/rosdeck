// widgets/imu/ImuWidget.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRosStore } from '../../stores/useRosStore';
import { WidgetEmptyState } from '../../components/WidgetEmptyState';
import { AttitudeIndicator } from './AttitudeIndicator';
import { DataPanels } from './DataPanels';
import { quaternionToEuler, radToDeg, computeMagneticHeading } from './math';
import type { WidgetProps } from '../../types/layout';

interface ImuState {
  roll: number;
  pitch: number;
  yaw: number;
  heading: number | null;
  angularVelocity: { x: number; y: number; z: number } | null;
  linearAcceleration: { x: number; y: number; z: number } | null;
}

const INITIAL_STATE: ImuState = {
  roll: 0,
  pitch: 0,
  yaw: 0,
  heading: null,
  angularVelocity: null,
  linearAcceleration: null,
};


export function ImuWidget(props: Partial<WidgetProps>) {
  const transport = useRosStore((s) => s.transport);
  const status = useRosStore((s) => s.connection.status);

  const topic = props?.config?.topic || '/imu/data';
  const imuHasCompass = props?.config?.imuHasCompass ?? false;
  const magTopic = props?.config?.magTopic || '';
  const displayMode = props?.config?.displayMode || 'attitude';
  const updateRate = parseInt(props?.config?.updateRate || '10', 10);
  const throttleMs = Math.round(1000 / updateRate);

  const width = props?.width ?? 300;
  const height = props?.height ?? 300;

  const [state, setState] = useState<ImuState>(INITIAL_STATE);
  const [showEmptyState, setShowEmptyState] = useState(false);
  const [indicatorSize, setIndicatorSize] = useState(0);

  const imuRef = useRef<any>(null);
  const magRef = useRef<any>(null);
  const hasReceivedData = useRef(false);
  const rafId = useRef<number>(0);
  const configRef = useRef({ imuHasCompass });
  configRef.current = { imuHasCompass };

  const flush = useCallback(() => {
    const imuMsg = imuRef.current;
    if (!imuMsg) return;

    const q = imuMsg.orientation;
    if (!q || q.w === undefined) return;

    const euler = quaternionToEuler(q);

    let heading: number | null = null;
    if (configRef.current.imuHasCompass) {
      // 9-axis IMU: negate yaw (ROS CCW+ → compass CW+)
      const h = -euler.yaw;
      heading = h < 0 ? h + 2 * Math.PI : h;
    } else {
      const mag = magRef.current;
      if (mag && mag.magnetic_field) {
        heading = computeMagneticHeading(mag.magnetic_field, q);
      }
    }

    setState({
      roll: euler.roll,
      pitch: euler.pitch,
      yaw: euler.yaw,
      heading,
      angularVelocity: imuMsg.angular_velocity || null,
      linearAcceleration: imuMsg.linear_acceleration || null,
    });
  }, []);

  // IMU subscription
  useEffect(() => {
    if (!transport || status !== 'connected') return;
    hasReceivedData.current = false;

    const sub = transport.subscribe(
      topic,
      'sensor_msgs/msg/Imu',
      (msg: any) => {
        hasReceivedData.current = true;
        imuRef.current = msg;
        cancelAnimationFrame(rafId.current);
        rafId.current = requestAnimationFrame(flush);
      },
      throttleMs,
    );

    return () => {
      sub.unsubscribe();
      cancelAnimationFrame(rafId.current);
    };
  }, [transport, status, topic, throttleMs, flush]);

  // Magnetometer subscription (optional)
  useEffect(() => {
    if (!transport || status !== 'connected' || !magTopic) return;

    const sub = transport.subscribe(
      magTopic,
      'sensor_msgs/msg/MagneticField',
      (msg: any) => {
        magRef.current = msg;
      },
      throttleMs,
    );

    return () => sub.unsubscribe();
  }, [transport, status, magTopic, throttleMs]);

  // Empty state timer
  useEffect(() => {
    if (status === 'connected') {
      const timer = setTimeout(() => {
        if (!hasReceivedData.current) setShowEmptyState(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
    setShowEmptyState(false);
    hasReceivedData.current = false;
  }, [status]);

  if (showEmptyState && !hasReceivedData.current) {
    return (
      <View style={[styles.container, { width, height }]}>
        <WidgetEmptyState widgetType="imu" topicName={topic} />
      </View>
    );
  }

  if (displayMode === 'data') {
    return (
      <View style={[styles.container, { width, height }]}>
        <DataPanels
          showAngularVelocity
          showLinearAcceleration
          showOrientationReadout
          angularVelocity={state.angularVelocity}
          linearAcceleration={state.linearAcceleration}
          rollDeg={radToDeg(state.roll)}
          pitchDeg={radToDeg(state.pitch)}
          yawDeg={radToDeg(state.yaw)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { width, height }]}>
      <View style={styles.content}>
        <View
          style={styles.indicatorWrap}
          onLayout={(e) => {
            const { width: w, height: h } = e.nativeEvent.layout;
            setIndicatorSize(Math.min(w, h));
          }}
        >
          {indicatorSize > 0 && (
            <AttitudeIndicator
              size={Math.max(80, indicatorSize)}
              roll={state.roll}
              pitch={state.pitch}
              heading={state.heading}
              yaw={state.yaw}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    padding: 8,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  indicatorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
