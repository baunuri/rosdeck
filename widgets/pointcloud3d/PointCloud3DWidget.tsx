// Ported from the lifliu/rosdeck fork (GPL-3.0), generalized for any robot.
import { Ionicons } from '@expo/vector-icons';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { WidgetEmptyState } from '../../components/WidgetEmptyState';
import { theme } from '../../constants/theme';
import { useRosStore } from '../../stores/useRosStore';
import type { WidgetProps } from '../../types/layout';
import { createPointRenderer, type Camera, type PointRenderer } from './gl';
import {
  AdaptiveVoxelAccumulator,
  parsePointCloud2,
  parsePointCloud2Flat,
  TfPositionTracker,
  type Point3D,
} from './transforms';

// The GPU draws any of these in one call; the cap only bounds JS parse time (~0.5 µs/point).
const MAX_RENDER_POINTS = 50000;
// ponytail: one cloud per 250 ms; accumulate mode skips scans between. Lower it for denser maps.
const CLOUD_INTERVAL_MS = 250;
// Above this, the bytes alone bog down the JS thread (see lib/binary-websocket.ts).
const LARGE_CLOUD_BYTES = 512 * 1024;
const ORIGIN: Point3D = { x: 0, y: 0, z: 0 };
const ISO_VIEW: Camera = { yaw: -0.7, pitch: 0.75, zoom: 1 };
const TOP_VIEW: Camera = { yaw: 0, pitch: 0, zoom: 1 };
const POINT_SIZE = 2 * PixelRatio.get();

interface RenderCloud { xyz: Float32Array; zMin: number; zMax: number }

/** Recentres on the view target (keeps float32 precision far from the origin) and finds the z range. */
function toRenderCloud(xyz: Float32Array, target: Point3D): RenderCloud {
  const rel = new Float32Array(xyz.length);
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 0; i < xyz.length; i += 3) {
    rel[i] = xyz[i] - target.x;
    rel[i + 1] = xyz[i + 1] - target.y;
    const z = (rel[i + 2] = xyz[i + 2] - target.z);
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  return { xyz: rel, zMin, zMax };
}

export function PointCloud3DWidget(props: Partial<WidgetProps>) {
  const transport = useRosStore((state) => state.transport);
  const connectionStatus = useRosStore((state) => state.connection.status);
  const topic = props?.config?.topic || '/points';
  const fixedFrame = String(props?.config?.fixedFrame || 'odom').replace(/^\//, '');
  const robotFrame = String(props?.config?.robotFrame || 'base_link').replace(/^\//, '');
  const accumulate = Boolean(props?.config?.accumulate);
  const viewMeters = Math.max(2, Number(props?.config?.viewMeters || 20));
  const width = Math.max(1, props?.width || 300);
  const height = Math.max(1, props?.height || 300);

  const accumulatorRef = useRef(new AdaptiveVoxelAccumulator(0.12, 60000));
  const tfTrackerRef = useRef(new TfPositionTracker());
  const [stats, setStats] = useState({ points: 0, frame: '', inFixedFrame: false, bytes: 0 });

  // Rendering state lives in refs: gestures and new clouds request a redraw, React never re-renders per frame.
  const rendererRef = useRef<PointRenderer | null>(null);
  const cloudRef = useRef<RenderCloud | null>(null);
  const cloudDirtyRef = useRef(false);
  const cameraRef = useRef<Camera>(ISO_VIEW);
  const gestureStartRef = useRef<Camera>(ISO_VIEW);
  const frameRequestedRef = useRef(false);
  const viewMetersRef = useRef(viewMeters);
  viewMetersRef.current = viewMeters;

  const requestDraw = useCallback(() => {
    if (frameRequestedRef.current) return;
    frameRequestedRef.current = true;
    requestAnimationFrame(() => {
      frameRequestedRef.current = false;
      const renderer = rendererRef.current;
      if (!renderer) return;
      if (cloudDirtyRef.current && cloudRef.current) {
        const { xyz, zMin, zMax } = cloudRef.current;
        renderer.setCloud(xyz, zMin, zMax);
        cloudDirtyRef.current = false;
      }
      renderer.draw(cameraRef.current, viewMetersRef.current, POINT_SIZE);
    });
  }, []);

  useEffect(requestDraw, [viewMeters, width, height, requestDraw]);

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    rendererRef.current = createPointRenderer(gl);
    cloudDirtyRef.current = true; // upload whatever arrived before the context existed
    requestDraw();
  }, [requestDraw]);

  const setCamera = useCallback((camera: Camera) => {
    cameraRef.current = camera;
    requestDraw();
  }, [requestDraw]);

  const clearPreview = useCallback(() => {
    accumulatorRef.current.clear();
    cloudRef.current = null;
    rendererRef.current = null; // GLView unmounts with the empty state; a new context comes with the next cloud
    setStats({ points: 0, frame: '', inFixedFrame: false, bytes: 0 });
  }, []);

  // Accumulated points live in the old fixed frame; never mix frames.
  useEffect(() => clearPreview(), [topic, fixedFrame, accumulate, clearPreview]);

  useEffect(() => {
    if (connectionStatus !== 'connected' || !transport) return;
    const tracker = tfTrackerRef.current;
    const handleTf = (message: any) => tracker.update(message);
    const tfSub = transport.subscribe('/tf', 'tf2_msgs/msg/TFMessage', handleTf);
    const staticTfSub = transport.subscribe('/tf_static', 'tf2_msgs/msg/TFMessage', handleTf);

    const cloudSub = transport.subscribe(topic, 'sensor_msgs/msg/PointCloud2', (message) => {
      const sourceFrame = String(message?.header?.frame_id || '');
      // ponytail: latest-TF only (no time sync); fast motion can skew clouds slightly.
      let xyz: Float32Array | null;
      let inFixedFrame: boolean;
      let count: number;
      if (accumulate) {
        // Voxel map stays object-based; it is bounded and only touched at CLOUD_INTERVAL_MS.
        const inFixed = tracker.transformPointCloud(
          parsePointCloud2(message, MAX_RENDER_POINTS), sourceFrame, fixedFrame);
        if (!inFixed || inFixed.length === 0) return; // never mix frames in the map
        const accumulator = accumulatorRef.current;
        accumulator.add(inFixed);
        xyz = Float32Array.from(accumulator.snapshot(MAX_RENDER_POINTS).flatMap((p) => [p.x, p.y, p.z]));
        inFixedFrame = true;
        count = accumulator.pointCount;
      } else {
        const raw = parsePointCloud2Flat(message, MAX_RENDER_POINTS);
        if (raw.length === 0) return;
        const inFixed = tracker.transformFlat(raw, sourceFrame, fixedFrame);
        xyz = inFixed ?? raw;
        inFixedFrame = Boolean(inFixed);
        count = xyz.length / 3;
      }
      const target = inFixedFrame ? tracker.lookupPosition(fixedFrame, robotFrame) ?? ORIGIN : ORIGIN;
      cloudRef.current = toRenderCloud(xyz, target);
      cloudDirtyRef.current = true;
      requestDraw();
      setStats({
        points: count, frame: inFixedFrame ? fixedFrame : sourceFrame, inFixedFrame,
        bytes: message?.data?.length ?? 0,
      });
    }, CLOUD_INTERVAL_MS);

    return () => {
      tfSub.unsubscribe();
      staticTfSub.unsubscribe();
      cloudSub.unsubscribe();
    };
  }, [connectionStatus, transport, topic, fixedFrame, robotFrame, accumulate, requestDraw]);

  // Callbacks run on the JS thread; each only stores the camera and requests a (sub-ms) GPU redraw.
  const gesture = useMemo(() => Gesture.Simultaneous(
    Gesture.Pan()
      .runOnJS(true)
      .onStart(() => { gestureStartRef.current = cameraRef.current; })
      .onUpdate((event) => {
        const start = gestureStartRef.current;
        setCamera({
          ...cameraRef.current,
          yaw: start.yaw + event.translationX * 0.008,
          pitch: Math.max(0, Math.min(1.4, start.pitch - event.translationY * 0.006)),
        });
      }),
    Gesture.Pinch()
      .runOnJS(true)
      .onStart(() => { gestureStartRef.current = cameraRef.current; })
      .onUpdate((event) => {
        setCamera({
          ...cameraRef.current,
          zoom: Math.max(0.5, Math.min(8, gestureStartRef.current.zoom * event.scale)),
        });
      }),
  ), [setCamera]);

  if (stats.points === 0) {
    return <WidgetEmptyState widgetType="pointcloud3d" topicName={topic} />;
  }

  return (
    <View style={styles.container}>
      <GestureDetector gesture={gesture}>
        <View style={{ width, height }}>
          <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
        </View>
      </GestureDetector>

      <View style={styles.stats} pointerEvents="none">
        <Text style={styles.statsText}>{stats.points.toLocaleString()} pts</Text>
        <Text style={styles.statsText}>
          {stats.frame}{stats.inFixedFrame ? '' : ` (no TF → ${fixedFrame})`}
        </Text>
        {stats.bytes > LARGE_CLOUD_BYTES && (
          <Text style={[styles.statsText, styles.warnText]}>
            {(stats.bytes / 1048576).toFixed(1)} MB/msg: downsample on the robot (VoxelGrid)
          </Text>
        )}
      </View>

      <View style={styles.controls}>
        <ControlButton icon="scan-outline" label="Top view" onPress={() => setCamera(TOP_VIEW)} />
        <ControlButton icon="cube-outline" label="3D view" onPress={() => setCamera(ISO_VIEW)} />
        {accumulate && (
          <ControlButton icon="trash-outline" label="Clear points" onPress={clearPreview} destructive />
        )}
      </View>
    </View>
  );
}

function ControlButton({ icon, label, onPress, destructive = false }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.controlButton}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons
        name={icon}
        size={17}
        color={destructive ? theme.colors.statusError : theme.colors.textPrimary}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#070A0F',
  },
  stats: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    backgroundColor: '#0D0D0DCC',
  },
  statsText: {
    color: theme.colors.textSecondary,
    fontFamily: 'SpaceMono',
    fontSize: 9,
    marginTop: 2,
  },
  warnText: {
    color: theme.colors.statusConnecting, // the theme's amber
  },
  controls: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    gap: 5,
  },
  controlButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    backgroundColor: '#0D0D0DDD',
  },
});
