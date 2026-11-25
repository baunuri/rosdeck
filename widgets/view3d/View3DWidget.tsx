// 3D View: an RViz-style scene (grid, map, costmaps, scan, point cloud, path, robot).
// Point-cloud parsing ported from the lifliu/rosdeck fork (GPL-3.0).
import { Ionicons } from '@expo/vector-icons';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { theme } from '../../constants/theme';
import * as Haptics from '../../lib/haptics';
import { useRosStore } from '../../stores/useRosStore';
import type { WidgetProps } from '../../types/layout';
import { COSTMAP_LUT, gridToRgbaFast, OCCUPANCY_LUT } from '../map/transforms';
import { unprojectGround, viewProjection, type Camera } from './camera';
import { arrow, gridCorners, gridLines, laserScanToXyz, pathToXyz, yawOf } from './geometry';
import { MarkerStore } from './markers';
import { createSceneRenderer, type Rgba, type SceneRenderer, type TextureLayer } from './renderer';
import {
  AdaptiveVoxelAccumulator,
  parsePointCloud2,
  parsePointCloud2Flat,
  TfPositionTracker,
} from './transforms';

// The GPU draws any of these in one call; the cap only bounds JS parse time (~0.5 µs/point).
const MAX_CLOUD_POINTS = 50000;
// ponytail: one cloud per 250 ms; accumulate mode skips scans between. Lower it for denser maps.
const CLOUD_INTERVAL_MS = 250;
const SCAN_INTERVAL_MS = 100;
// Above this, the bytes alone bog down the JS thread (see lib/binary-websocket.ts).
const LARGE_CLOUD_BYTES = 512 * 1024;
const TILTED_PITCH = 0.75;
const PX = PixelRatio.get();

function rgba(hex: string, alpha = 1): Rgba {
  const n = parseInt(hex.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
}
const COLORS = {
  grid: rgba('#FFFFFF', 0.07),
  scan: rgba(theme.colors.accentPrimary),
  path: rgba('#FBBF24'),
  robot: rgba(theme.colors.statusConnected),
  footprint: rgba(theme.colors.statusConnected, 0.9),
  goal: rgba(theme.colors.statusError),
  poseEstimate: rgba('#22D3EE'),
};
// RViz's 2D Pose Estimate covariance: 0.5 m std-dev in x/y, ~15° in yaw.
const POSE_COVARIANCE = [0.25, 0, 0, 0, 0, 0, 0, 0.25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.06853891945200942];
type Tool = 'goal' | 'pose';
const GOAL_HOLD_MS = 450;
const TF_AXIS_LENGTH = 0.3;
const SLOW_LAYER_MS = 100; // TF axes and markers in moving frames re-placed at most 10x/s
// ponytail: MarkerArrays decoded at most 2x/s (skipped ones are never decoded). Fine when each
// array is the full current set (planners' sample spheres: 7.6k markers, 1.9 MB, 14 Hz);
// incremental publishers would lose updates. Single Marker topics are never throttled.
const MARKER_ARRAY_INTERVAL_MS = 500;
const MARKER_TF_REFRESH_MS = 500; // re-place unchanged markers this often to follow TF

interface GridLayer { pixels: Uint8Array; width: number; height: number; corners: Float32Array; frame: string; opacity: number }

export function View3DWidget(props: Partial<WidgetProps>) {
  const transport = useRosStore((state) => state.transport);
  const connectionStatus = useRosStore((state) => state.connection.status);
  const config = props?.config ?? {};
  const fixedFrame = String(config.fixedFrame || 'map').replace(/^\//, '');
  const robotFrame = String(config.robotFrame || 'base_link').replace(/^\//, '');
  const mapTopic: string = config.mapTopic ?? '/map';
  const globalCostmapTopic: string = config.globalCostmapTopic ?? '/global_costmap/costmap';
  const localCostmapTopic: string = config.localCostmapTopic ?? '/local_costmap/costmap';
  const costmapOpacity = Number(config.costmapOpacity ?? 0.5);
  const scanTopic: string = config.scanTopic ?? '/scan';
  // Several clouds: comma-separated topics, one layer each.
  const cloudTopicList: string = String(config.cloudTopic ?? '');
  const cloudTopics = useMemo(() => cloudTopicList.split(',').map((t) => t.trim()).filter(Boolean), [cloudTopicList]);
  const footprintTopic: string = config.footprintTopic ?? '/local_costmap/published_footprint';
  const markerArrayTopic: string = config.markerArrayTopic ?? '';
  const markerTopic: string = config.markerTopic ?? '';
  const showTf = Boolean(config.showTf);
  const pathTopic: string = config.pathTopic ?? '/plan';
  const enableGoal = config.enableGoal ?? true;
  const goalTopic: string = config.goalTopic || '/goal_pose';
  const enablePoseEstimate = config.enablePoseEstimate ?? true;
  const poseEstimateTopic: string = config.poseEstimateTopic || '/initialpose';
  const accumulate = Boolean(config.accumulate);
  const showGrid = config.showGrid ?? true;
  const startTopDown = Boolean(config.topDown);
  // RViz-like: Orbit (perspective) in 3D, TopDownOrtho when top-down.
  const usePerspective = config.perspective ?? true;
  const width = Math.max(1, props?.width || 300);
  const height = Math.max(1, props?.height || 300);

  const [stats, setStats] = useState({ frame: '', fallback: false, robot: false, cloudPoints: 0, cloudBytes: 0 });
  const [follow, setFollowState] = useState(true);
  const [topDown, setTopDown] = useState(startTopDown);
  const [placingGoal, setPlacingGoal] = useState(false);
  const [tool, setToolState] = useState<Tool>(enableGoal ? 'goal' : 'pose');
  const toolRef = useRef<Tool>(tool);
  const setTool = useCallback((t: Tool) => { toolRef.current = t; setToolState(t); }, []);

  // Scene state lives in refs: data and gestures request a frame; React never re-renders per frame.
  const tracker = useRef(new TfPositionTracker()).current;
  const accumulators = useRef(new Map<string, AdaptiveVoxelAccumulator>()).current;
  const cloudStats = useRef(new Map<string, { points: number; bytes: number }>()).current;
  const markers = useRef(new MarkerStore()).current;
  const slowLayers = useRef({ at: 0, markerVersion: -1, markerAt: 0 });
  const cloudTopicsRef = useRef(cloudTopics);
  cloudTopicsRef.current = cloudTopics;
  const rendererRef = useRef<SceneRenderer | null>(null);
  const grids = useRef<Partial<Record<TextureLayer, GridLayer>>>({}).current;
  const dirtyGrids = useRef(new Set<TextureLayer>()).current;
  const pending = useRef<{
    scan?: Float32Array | null; path?: Float32Array | null; goal?: Float32Array | null; footprint?: Float32Array | null;
    clouds: Map<string, { xyz: Float32Array; zMin: number; zMax: number } | null>;
  }>({ clouds: new Map() }).current;
  const goalDraft = useRef<{ x: number; y: number; yaw: number } | null>(null);
  const fixedRef = useRef(fixedFrame);
  const followRef = useRef(true);
  const cameraRef = useRef<Camera>({
    yaw: 0, pitch: startTopDown ? 0 : TILTED_PITCH, perspective: !startTopDown && usePerspective, viewMeters: Math.max(2, Number(config.viewMeters || 20)), target: { x: 0, y: 0, z: 0 },
  });
  const gestureStart = useRef<Camera>(cameraRef.current);
  const frameRequested = useRef(false);
  const sizeRef = useRef({ width, height });
  sizeRef.current = { width, height };
  const lastStats = useRef('');
  const dataVersion = useRef(0); // bumped whenever a layer's data changes
  const lastDrawn = useRef('');

  /**
   * The configured frame whenever anything lives in it (TF or a layer such as the map), like
   * RViz: before AMCL localizes, the map still shows in `map` and you set the initial pose
   * on it; only the robot is missing. Otherwise odom, else the robot's own frame.
   */
  const resolveFixedFrame = useCallback(() => {
    const known = tracker.hasFrame(fixedFrame) || Object.values(grids).some((g) => g?.frame === fixedFrame);
    if (known) return fixedFrame;
    if (tracker.lookupPose('odom', robotFrame)) return 'odom';
    return robotFrame;
  }, [fixedFrame, grids, robotFrame, tracker]);

  const renderFrame = useCallback(() => {
    frameRequested.current = false;
    const renderer = rendererRef.current;
    if (!renderer) return;
    const fixed = resolveFixedFrame();
    fixedRef.current = fixed;

    const pose = tracker.lookupPose(fixed, robotFrame);
    if (pose) {
      const { x, y, z } = pose.translation;
      renderer.setShape('robot', arrow(x, y, z + 0.05, yawOf(pose.rotation)), { color: COLORS.robot, mode: 'triangles' });
      if (followRef.current) cameraRef.current = { ...cameraRef.current, target: { x, y, z: 0 } };
    }

    // Grids live in their own frame (the local costmap moves with odom); re-place them every frame.
    for (const name of Object.keys(grids) as TextureLayer[]) {
      const grid = grids[name]!;
      const corners = tracker.transformFlat(grid.corners.slice(), grid.frame, fixed);
      if (!corners) continue;
      if (dirtyGrids.has(name)) {
        renderer.setTexture(name, { rgba: grid.pixels, width: grid.width, height: grid.height, corners, opacity: grid.opacity });
        dirtyGrids.delete(name);
      } else {
        renderer.moveTexture(name, corners);
      }
    }
    if (pending.scan !== undefined) {
      renderer.setPoints('scan', pending.scan, { color: COLORS.scan, size: 3 * PX });
      delete pending.scan;
    }
    for (const [topic, cloud] of pending.clouds) {
      renderer.setPoints(`cloud:${topic}`, cloud?.xyz ?? null, cloud ? { color: COLORS.scan, size: 2 * PX, heightColored: true, zMin: cloud.zMin, zMax: cloud.zMax } : undefined);
    }
    pending.clouds.clear();
    for (const name of renderer.pointLayers()) {
      if (!cloudTopicsRef.current.includes(name.slice('cloud:'.length))) renderer.setPoints(name as `cloud:${string}`, null);
    }
    if (pending.footprint !== undefined) {
      renderer.setShape('footprint', pending.footprint, { color: COLORS.footprint, mode: 'loop' });
      delete pending.footprint;
    }

    // TF axes and markers depend on TF that changes every message: re-place them at most 10x/s.
    const now = Date.now();
    markers.prune(now);
    if (now - slowLayers.current.at > SLOW_LAYER_MS) {
      const markersChanged = markers.version !== slowLayers.current.markerVersion;
      slowLayers.current = { ...slowLayers.current, at: now, markerVersion: markers.version };
      let rebuilt = false;
      const markerTfDue = markers.size > 0 && now - slowLayers.current.markerAt > MARKER_TF_REFRESH_MS;
      if (markersChanged || markerTfDue) {
        slowLayers.current.markerAt = now;
        rebuilt = true;
        const built = markers.build((xyz, frame) => tracker.transformFlat(xyz, frame, fixed));
        renderer.setColored('markerTriangles', built.triangles.xyz, built.triangles.rgba, 'triangles');
        renderer.setColored('markerLines', built.lines.xyz, built.lines.rgba, 'lines');
        renderer.setColored('markerPoints', built.points.xyz, built.points.rgba, 'points', 4 * PX);
      }
      if (showTf) {
        const xyz: number[] = [];
        const colors: number[] = [];
        for (const frame of tracker.frames()) {
          const p = tracker.lookupPose(fixed, frame);
          if (!p) continue;
          const { x, y, z } = p.translation;
          const q = p.rotation;
          // Columns of the frame's rotation matrix = its x/y/z axes in the fixed frame.
          const axes = [
            [1 - 2 * (q.y * q.y + q.z * q.z), 2 * (q.x * q.y + q.z * q.w), 2 * (q.x * q.z - q.y * q.w)],
            [2 * (q.x * q.y - q.z * q.w), 1 - 2 * (q.x * q.x + q.z * q.z), 2 * (q.y * q.z + q.x * q.w)],
            [2 * (q.x * q.z + q.y * q.w), 2 * (q.y * q.z - q.x * q.w), 1 - 2 * (q.x * q.x + q.y * q.y)],
          ];
          axes.forEach((a, i) => {
            xyz.push(x, y, z, x + a[0] * TF_AXIS_LENGTH, y + a[1] * TF_AXIS_LENGTH, z + a[2] * TF_AXIS_LENGTH);
            const c = [i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0, 1];
            colors.push(...c, ...c);
          });
        }
        renderer.setColored('tf', Float32Array.from(xyz), Float32Array.from(colors), 'lines');
        rebuilt = true;
      } else {
        renderer.setColored('tf', null);
      }
      if (rebuilt) dataVersion.current++;
    }
    if (pending.goal !== undefined) {
      renderer.setShape('goal', pending.goal, { color: toolRef.current === 'pose' ? COLORS.poseEstimate : COLORS.goal, mode: 'triangles' });
      delete pending.goal;
    }
    if (pending.path !== undefined) {
      renderer.setShape('path', pending.path, { color: COLORS.path, mode: 'strip' });
      delete pending.path;
    }

    // TF arrives far faster than the robot moves: only draw when something visible changed.
    const { width: w, height: h } = sizeRef.current;
    const cam = cameraRef.current;
    const r = (v: number) => Math.round(v * 1000);
    const signature = [
      dataVersion.current, fixed, w, h, r(cam.yaw), r(cam.pitch), r(cam.viewMeters), cam.perspective ? 'p' : 'o',
      r(cam.target.x), r(cam.target.y), r(cam.target.z),
      pose ? [r(pose.translation.x), r(pose.translation.y), r(pose.rotation.z), r(pose.rotation.w)].join() : '-',
    ].join('|');
    if (signature !== lastDrawn.current) {
      lastDrawn.current = signature;
      renderer.draw(viewProjection(cam, w, h));
    }

    const next = { frame: fixed, fallback: fixed !== fixedFrame, robot: Boolean(pose) };
    const key = JSON.stringify(next);
    if (key !== lastStats.current) {
      lastStats.current = key;
      setStats((s) => ({ ...s, ...next }));
    }
  }, [dirtyGrids, fixedFrame, grids, markers, pending, resolveFixedFrame, robotFrame, showTf, tracker]);

  const requestDraw = useCallback(() => {
    if (frameRequested.current) return;
    frameRequested.current = true;
    requestAnimationFrame(renderFrame);
  }, [renderFrame]);

  useEffect(requestDraw, [width, height, requestDraw]);

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    const renderer = createSceneRenderer(gl);
    rendererRef.current = renderer;
    renderer.setShape('grid', showGrid ? gridLines(50, 1) : null, { color: COLORS.grid, mode: 'lines' });
    Object.keys(grids).forEach((name) => dirtyGrids.add(name as TextureLayer)); // re-upload into the new context
    dataVersion.current++;
    lastDrawn.current = '';
    requestDraw();
  }, [dirtyGrids, grids, requestDraw, showGrid]);

  const setCamera = useCallback((camera: Camera) => {
    cameraRef.current = camera;
    requestDraw();
  }, [requestDraw]);

  const setFollow = useCallback((on: boolean) => {
    followRef.current = on;
    setFollowState(on);
    requestDraw();
  }, [requestDraw]);

  const clearCloud = useCallback(() => {
    accumulators.clear();
    cloudStats.clear();
    for (const topic of cloudTopicsRef.current) pending.clouds.set(topic, null);
    dataVersion.current++;
    setStats((s) => ({ ...s, cloudPoints: 0, cloudBytes: 0 }));
    requestDraw();
  }, [accumulators, cloudStats, pending, requestDraw]);

  // Accumulated points live in the old fixed frame; never mix frames.
  useEffect(() => clearCloud(), [cloudTopicList, fixedFrame, accumulate, clearCloud]);

  useEffect(() => {
    if (connectionStatus !== 'connected' || !transport) return;
    const subs: Array<{ unsubscribe(): void }> = [];
    const sub = (topic: string, type: string, cb: (m: any) => void, throttle?: number) => {
      if (topic) subs.push(transport.subscribe(topic, type, cb, throttle));
    };

    const onTf = (message: any) => { tracker.update(message); requestDraw(); };
    sub('/tf', 'tf2_msgs/msg/TFMessage', onTf);
    sub('/tf_static', 'tf2_msgs/msg/TFMessage', onTf);

    const onGrid = (name: TextureLayer, lut: Uint32Array, zOffset: number, opacity: number) => (m: any) => {
      const info = m?.info;
      if (!info?.width || !info?.height) return;
      const { pixels, width: w, height: h } = gridToRgbaFast(m.data, info.width, info.height, lut);
      grids[name] = {
        pixels, width: w, height: h,
        corners: gridCorners(info, zOffset), frame: String(m.header?.frame_id || 'map'), opacity,
      };
      dirtyGrids.add(name);
      dataVersion.current++;
      requestDraw();
    };
    sub(mapTopic, 'nav_msgs/msg/OccupancyGrid',
      onGrid('map', OCCUPANCY_LUT, -0.02, 1));
    sub(globalCostmapTopic, 'nav_msgs/msg/OccupancyGrid',
      onGrid('globalCostmap', COSTMAP_LUT, -0.01, costmapOpacity), 500);
    sub(localCostmapTopic, 'nav_msgs/msg/OccupancyGrid',
      onGrid('localCostmap', COSTMAP_LUT, 0, costmapOpacity), 200);

    // Sensor data is transformed into the fixed frame once, on arrival (latest TF, like RViz).
    sub(scanTopic, 'sensor_msgs/msg/LaserScan', (m) => {
      const xyz = tracker.transformFlat(laserScanToXyz(m), String(m.header?.frame_id || ''), fixedRef.current);
      if (!xyz) return;
      pending.scan = xyz;
      dataVersion.current++;
      requestDraw();
    }, SCAN_INTERVAL_MS);

    for (const topic of cloudTopics) sub(topic, 'sensor_msgs/msg/PointCloud2', (m) => {
      const source = String(m.header?.frame_id || '');
      const fixed = fixedRef.current;
      let xyz: Float32Array | null;
      let count: number;
      if (accumulate) {
        // Voxel map stays object-based; it is bounded and only touched at CLOUD_INTERVAL_MS.
        const inFixed = tracker.transformPointCloud(parsePointCloud2(m, MAX_CLOUD_POINTS), source, fixed);
        if (!inFixed || inFixed.length === 0) return; // never mix frames in the map
        let acc = accumulators.get(topic);
        if (!acc) accumulators.set(topic, (acc = new AdaptiveVoxelAccumulator(0.12, 60000)));
        acc.add(inFixed);
        xyz = Float32Array.from(acc.snapshot(MAX_CLOUD_POINTS).flatMap((p) => [p.x, p.y, p.z]));
        count = acc.pointCount;
      } else {
        xyz = tracker.transformFlat(parsePointCloud2Flat(m, MAX_CLOUD_POINTS), source, fixed);
        if (!xyz) return;
        count = xyz.length / 3;
      }
      let zMin = Infinity, zMax = -Infinity;
      for (let i = 2; i < xyz.length; i += 3) { if (xyz[i] < zMin) zMin = xyz[i]; if (xyz[i] > zMax) zMax = xyz[i]; }
      pending.clouds.set(topic, { xyz, zMin, zMax });
      cloudStats.set(topic, { points: count, bytes: m?.data?.length ?? 0 });
      dataVersion.current++;
      const all = [...cloudStats.values()];
      setStats((s) => ({
        ...s,
        cloudPoints: all.reduce((n, c) => n + c.points, 0),
        cloudBytes: Math.max(...all.map((c) => c.bytes)),
      }));
      requestDraw();
    }, CLOUD_INTERVAL_MS);

    sub(footprintTopic, 'geometry_msgs/msg/PolygonStamped', (m) => {
      const pts: Array<{ x: number; y: number; z: number }> = m?.polygon?.points ?? [];
      const local = Float32Array.from(pts.flatMap((p) => [p.x, p.y, (p.z ?? 0) + 0.03]));
      pending.footprint = tracker.transformFlat(local, String(m.header?.frame_id || ''), fixedRef.current);
      dataVersion.current++;
      requestDraw();
    }, 200);

    sub(markerArrayTopic, 'visualization_msgs/msg/MarkerArray', (m) => {
      for (const marker of m?.markers ?? []) markers.apply(marker);
      requestDraw();
    }, MARKER_ARRAY_INTERVAL_MS);
    sub(markerTopic, 'visualization_msgs/msg/Marker', (m) => {
      markers.apply(m);
      requestDraw();
    });

    sub(pathTopic, 'nav_msgs/msg/Path', (m) => {
      pending.path = tracker.transformFlat(pathToXyz(m), String(m.header?.frame_id || 'map'), fixedRef.current);
      dataVersion.current++;
      requestDraw();
    }, 200);

    return () => subs.forEach((s) => s.unsubscribe());
  }, [
    connectionStatus, transport, mapTopic, globalCostmapTopic, localCostmapTopic, costmapOpacity,
    scanTopic, cloudTopics, pathTopic, footprintTopic, markerArrayTopic, markerTopic, accumulate,
    tracker, accumulators, cloudStats, markers, grids, dirtyGrids, pending, requestDraw,
  ]);

  // RViz-style controls: one finger orbits, two fingers pan (stops following), pinch zooms.
  // Callbacks run on the JS thread; each only updates the camera and requests a GPU frame.
  const gesture = useMemo(() => {
    const begin = () => { gestureStart.current = cameraRef.current; };
    const orbit = Gesture.Pan().maxPointers(1).runOnJS(true).onStart(begin).onUpdate((e) => {
      const start = gestureStart.current;
      setTopDown(false);
      setCamera({
        ...cameraRef.current,
        perspective: usePerspective,
        yaw: start.yaw + e.translationX * 0.008,
        pitch: Math.max(0, Math.min(1.45, start.pitch - e.translationY * 0.006)),
      });
    });
    const pan = Gesture.Pan().minPointers(2).runOnJS(true).onStart(() => { begin(); setFollow(false); }).onUpdate((e) => {
      const start = gestureStart.current;
      const { width: w, height: h } = sizeRef.current;
      const ppm = Math.min(w, h) / start.viewMeters;
      const right = -e.translationX / ppm;
      const fwd = e.translationY / ppm / Math.max(0.3, Math.cos(start.pitch));
      const c = Math.cos(start.yaw), s = Math.sin(start.yaw);
      setCamera({
        ...cameraRef.current,
        target: { x: start.target.x + c * right + s * fwd, y: start.target.y - s * right + c * fwd, z: start.target.z },
      });
    });
    const pinch = Gesture.Pinch().runOnJS(true).onStart(begin).onUpdate((e) => {
      setCamera({ ...cameraRef.current, viewMeters: Math.max(1, Math.min(500, gestureStart.current.viewMeters / e.scale)) });
    });
    const view = Gesture.Simultaneous(orbit, pan, pinch);
    if (!enableGoal && !enablePoseEstimate) return view;

    // RViz "2D Goal Pose" / "2D Pose Estimate": hold to place, drag to aim, release to send.
    // Moving before the hold time elapses orbits instead (the two race).
    const showGoal = () => {
      const g = goalDraft.current;
      pending.goal = g ? arrow(g.x, g.y, 0.06, g.yaw, 0.8, 0.45) : null;
      dataVersion.current++;
      requestDraw();
    };
    const goal = Gesture.Pan().maxPointers(1).activateAfterLongPress(GOAL_HOLD_MS).runOnJS(true)
      .onStart((e) => {
        const { width: w, height: h } = sizeRef.current;
        const p = unprojectGround(cameraRef.current, w, h, e.x, e.y);
        if (!p) return;
        goalDraft.current = { x: p.x, y: p.y, yaw: 0 };
        setPlacingGoal(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        showGoal();
      })
      .onUpdate((e) => {
        const g = goalDraft.current;
        if (!g) return;
        const { width: w, height: h } = sizeRef.current;
        const p = unprojectGround(cameraRef.current, w, h, e.x, e.y);
        if (p && Math.hypot(p.x - g.x, p.y - g.y) > 0.05) g.yaw = Math.atan2(p.y - g.y, p.x - g.x);
        showGoal();
      })
      .onEnd(() => {
        const g = goalDraft.current;
        if (!g || !transport) return;
        const now = Date.now();
        const header = { stamp: { sec: Math.floor(now / 1000), nanosec: (now % 1000) * 1_000_000 }, frame_id: fixedRef.current };
        const pose = {
          position: { x: g.x, y: g.y, z: 0 },
          orientation: { x: 0, y: 0, z: Math.sin(g.yaw / 2), w: Math.cos(g.yaw / 2) },
        };
        if (toolRef.current === 'pose') {
          transport.publish(poseEstimateTopic, 'geometry_msgs/msg/PoseWithCovarianceStamped', {
            header, pose: { pose, covariance: POSE_COVARIANCE },
          });
        } else {
          transport.publish(goalTopic, 'geometry_msgs/msg/PoseStamped', { header, pose });
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      })
      .onFinalize(() => {
        goalDraft.current = null; // the arrow stays until the next goal; only the draft ends
        setPlacingGoal(false);
      });
    return Gesture.Race(goal, view);
  }, [enableGoal, enablePoseEstimate, goalTopic, poseEstimateTopic, pending, requestDraw, setCamera, setFollow, transport, usePerspective]);

  const toggleTopDown = useCallback(() => {
    const next = !topDown;
    setTopDown(next);
    setCamera({
      ...cameraRef.current,
      yaw: next ? 0 : cameraRef.current.yaw,
      pitch: next ? 0 : TILTED_PITCH,
      perspective: !next && usePerspective,
    });
  }, [setCamera, topDown, usePerspective]);

  if (connectionStatus !== 'connected') {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="cube-outline" size={36} color={theme.colors.textMuted} />
        <Text style={styles.placeholder}>Connect to a robot to see the 3D view</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GestureDetector gesture={gesture}>
        <View style={{ width, height }}>
          <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
        </View>
      </GestureDetector>

      <View style={styles.stats} pointerEvents="none">
        <Text style={styles.statsText}>
          {stats.frame || fixedFrame}{stats.fallback ? ` (no TF to ${fixedFrame})` : ''}
        </Text>
        {!stats.robot && <Text style={[styles.statsText, styles.warnText]}>waiting for TF → {robotFrame}</Text>}
        {placingGoal && (
          <Text style={[styles.statsText, tool === 'pose' ? styles.poseText : styles.goalText]}>
            drag to aim · release to {tool === 'pose' ? 'set pose estimate' : 'send goal'}
          </Text>
        )}
        {stats.cloudPoints > 0 && <Text style={styles.statsText}>{stats.cloudPoints.toLocaleString()} pts</Text>}
        {stats.cloudBytes > LARGE_CLOUD_BYTES && (
          <Text style={[styles.statsText, styles.warnText]}>
            {(stats.cloudBytes / 1048576).toFixed(1)} MB/msg: downsample on the robot (VoxelGrid)
          </Text>
        )}
      </View>

      <View style={styles.controls}>
        <ControlButton icon={topDown ? 'cube-outline' : 'map-outline'} label={topDown ? '3D view' : 'Top-down view'} onPress={toggleTopDown} />
        <ControlButton icon="locate-outline" label="Follow robot" onPress={() => setFollow(!follow)} active={follow} />
        {enableGoal && enablePoseEstimate && (
          <ControlButton
            icon={tool === 'goal' ? 'flag-outline' : 'navigate-outline'}
            label={tool === 'goal' ? 'Tool: Nav goal (tap for pose estimate)' : 'Tool: Pose estimate (tap for nav goal)'}
            onPress={() => setTool(tool === 'goal' ? 'pose' : 'goal')}
          />
        )}
        {accumulate && cloudTopics.length > 0 && (
          <ControlButton icon="trash-outline" label="Clear points" onPress={clearCloud} destructive />
        )}
      </View>
    </View>
  );
}

function ControlButton({ icon, label, onPress, destructive = false, active = false }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  active?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.controlButton, active && styles.controlButtonActive]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <Ionicons
        name={icon}
        size={17}
        color={destructive ? theme.colors.statusError : active ? theme.colors.accentPrimary : theme.colors.textPrimary}
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
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  placeholder: {
    color: theme.colors.textMuted,
    fontSize: 13,
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
  goalText: {
    color: theme.colors.statusError,
  },
  poseText: {
    color: '#22D3EE',
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
  controlButtonActive: {
    borderColor: theme.colors.accentPrimary,
  },
});
