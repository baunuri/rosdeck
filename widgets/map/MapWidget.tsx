import {
  AlphaType,
  Canvas,
  ColorType,
  Group,
  Path,
  Points,
  Skia,
  Image as SkiaImage,
  vec,
  translate,
  scale,
  multiply4,
  type Matrix4,
} from "@shopify/react-native-skia";
import * as Haptics from "../../lib/haptics";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS, useSharedValue, useDerivedValue } from "react-native-reanimated";
import { WidgetEmptyState } from "../../components/WidgetEmptyState";
import { theme } from "../../constants/theme";
import { useRosStore } from "../../stores/useRosStore";
import type { WidgetProps } from "../../types/layout";
import { laserScanToPoints } from "../laserscan/transforms";
import {
  canvasToWorld,
  costmapGridToPixels,
  occupancyGridToPixels,
  worldToCanvas,
} from "./transforms";

interface MapInfo {
  width: number;
  height: number;
  resolution: number;
  origin: { x: number; y: number };
}

interface RobotPose {
  x: number;
  y: number;
  yaw: number;
}

interface Transform2D {
  x: number;
  y: number;
  yaw: number;
}

function quaternionToYaw(q: {
  x: number;
  y: number;
  z: number;
  w: number;
}): number {
  return Math.atan2(
    2 * (q.w * q.z + q.x * q.y),
    1 - 2 * (q.y * q.y + q.z * q.z),
  );
}

function applyTransform(pose: RobotPose, tf: Transform2D): RobotPose {
  const cos = Math.cos(tf.yaw);
  const sin = Math.sin(tf.yaw);
  return {
    x: tf.x + pose.x * cos - pose.y * sin,
    y: tf.y + pose.x * sin + pose.y * cos,
    yaw: tf.yaw + pose.yaw,
  };
}

/**
 * BFS chain-lookup through the TF tree.
 * Returns the pose of `to` in `from` frame, or null if unreachable.
 */
function lookupTransform(
  tfMap: Map<string, Map<string, Transform2D>>,
  from: string,
  to: string,
): Transform2D | null {
  if (from === to) return { x: 0, y: 0, yaw: 0 };
  const queue: Array<{ frame: string; tf: Transform2D }> = [
    { frame: from, tf: { x: 0, y: 0, yaw: 0 } },
  ];
  const visited = new Set<string>([from]);
  while (queue.length > 0) {
    const { frame, tf: acc } = queue.shift()!;
    const children = tfMap.get(frame);
    if (!children) continue;
    for (const [child, childTf] of children.entries()) {
      if (visited.has(child)) continue;
      visited.add(child);
      const composed: Transform2D = {
        x:
          acc.x + childTf.x * Math.cos(acc.yaw) - childTf.y * Math.sin(acc.yaw),
        y:
          acc.y + childTf.x * Math.sin(acc.yaw) + childTf.y * Math.cos(acc.yaw),
        yaw: acc.yaw + childTf.yaw,
      };
      if (child === to) return composed;
      queue.push({ frame: child, tf: composed });
    }
  }
  return null;
}


export function MapWidget(props: Partial<WidgetProps>) {
  const transport = useRosStore((s) => s.transport);
  const status = useRosStore((s) => s.connection.status);
  const topic = props?.config?.topic || "/map";
  const scanTopic = props?.config?.scanTopic || "/scan";
  const mapFrame: string = (props?.config?.mapFrame || "map").replace(
    /^\//,
    "",
  );
  const robotFrame: string = (props?.config?.robotFrame || "base_link").replace(
    /^\//,
    "",
  );
  const flipIndicator: boolean = props?.config?.flipIndicator ?? false;
  const enableNav2Goal = props?.config?.enableNav2Goal || false;
  const nav2GoalTopic = props?.config?.nav2GoalTopic || "/goal_pose";
  const globalCostmapTopic = props?.config?.globalCostmapTopic || "";
  const localCostmapTopic = props?.config?.localCostmapTopic || "";
  const updateRateHz: number = props?.config?.updateRate ?? 0;
  // throttleRate is in ms for rosbridge; 0 = no throttle (use robot's publish rate)
  const throttleRate = updateRateHz > 0 ? Math.round(1000 / updateRateHz) : 0;
  const width = props?.width || 300;
  const height = props?.height || 300;

  const [mapData, setMapData] = useState<{
    pixels: Uint8Array;
    info: MapInfo;
  } | null>(null);

  const [globalCostmap, setGlobalCostmap] = useState<{
    pixels: Uint8Array;
    info: MapInfo;
    frameId: string;
  } | null>(null);
  const [localCostmap, setLocalCostmap] = useState<{
    pixels: Uint8Array;
    info: MapInfo;
    frameId: string;
  } | null>(null);
  const [robotPose, setRobotPose] = useState<RobotPose | null>(null);
  const [mapToOdom, setMapToOdom] = useState<Transform2D>({
    x: 0,
    y: 0,
    yaw: 0,
  });
  const [scanPoints, setScanPoints] = useState<[number, number][]>([]);

  // Refs + RAF for high-frequency data to avoid render cascades
  const robotPoseRef = useRef<RobotPose | null>(null);
  const scanPointsRef = useRef<[number, number][]>([]);
  const scanFrameIdRef = useRef<string>("");
  const mapToOdomRef = useRef<Transform2D>({ x: 0, y: 0, yaw: 0 });
  // Full TF tree: parent -> Map<child, Transform2D>
  const tfTransformsRef = useRef<Map<string, Map<string, Transform2D>>>(
    new Map(),
  );
  const rafId = useRef<number>(0);
  const rafScheduled = useRef(false);

  const scheduleStateFlush = useCallback(() => {
    if (rafScheduled.current) return;
    rafScheduled.current = true;
    rafId.current = requestAnimationFrame(() => {
      rafScheduled.current = false;
      setRobotPose(robotPoseRef.current);
      setScanPoints(scanPointsRef.current);
      setMapToOdom(mapToOdomRef.current);
    });
  }, []);
  const [goalPosition, setGoalPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [showEmptyState, setShowEmptyState] = useState(false);

  // Memoized Skia images to prevent per-render GPU re-upload
  const skiaImage = useMemo(() => {
    if (!mapData) return null;
    return Skia.Image.MakeImage(
      {
        width: mapData.info.width,
        height: mapData.info.height,
        alphaType: AlphaType.Opaque,
        colorType: ColorType.RGBA_8888,
      },
      Skia.Data.fromBytes(mapData.pixels),
      mapData.info.width * 4,
    );
  }, [mapData]);

  const globalCostmapImage = useMemo(() => {
    if (!globalCostmap) return null;
    return Skia.Image.MakeImage(
      {
        width: globalCostmap.info.width,
        height: globalCostmap.info.height,
        alphaType: AlphaType.Premul,
        colorType: ColorType.RGBA_8888,
      },
      Skia.Data.fromBytes(globalCostmap.pixels),
      globalCostmap.info.width * 4,
    );
  }, [globalCostmap]);

  const localCostmapImage = useMemo(() => {
    if (!localCostmap) return null;
    return Skia.Image.MakeImage(
      {
        width: localCostmap.info.width,
        height: localCostmap.info.height,
        alphaType: AlphaType.Premul,
        colorType: ColorType.RGBA_8888,
      },
      Skia.Data.fromBytes(localCostmap.pixels),
      localCostmap.info.width * 4,
    );
  }, [localCostmap]);

  // View-state shared values (will replace viewState in Task 4)
  const zoomSV      = useSharedValue(1);
  const panXSV      = useSharedValue(0);
  const panYSV      = useSharedValue(0);
  const savedZoomSV = useSharedValue(1);
  const savedPanXSV = useSharedValue(0);
  const savedPanYSV = useSharedValue(0);

  // Scene param shared values
  const fitScaleSV      = useSharedValue(1);
  const mapWidthSV      = useSharedValue(0);
  const mapHeightSV     = useSharedValue(0);
  const canvasWSV       = useSharedValue(width);
  const canvasHSV       = useSharedValue(height);
  const basePpmSV       = useSharedValue(Math.min(width, height) / 20);
  const followRobotSV   = useSharedValue(false);
  const robotMapPixelSV = useSharedValue<{ gx: number; gy: number } | null>(null);

  const [followRobot, setFollowRobot] = useState(false);

  // Sync canvas dimensions and base ppm into shared values
  useEffect(() => {
    canvasWSV.value = width;
    canvasHSV.value = height;
    basePpmSV.value = Math.min(width, height) / 20;
  }, [width, height]);

  // Sync map scene params into shared values
  useEffect(() => {
    if (!mapData) return;
    fitScaleSV.value  = Math.min(width / mapData.info.width, height / mapData.info.height);
    mapWidthSV.value  = mapData.info.width;
    mapHeightSV.value = mapData.info.height;
  }, [mapData, width, height]);

  // Sync followRobot flag into shared value during render (not post-render)
  // so groupMatrix reads the new value on the same frame as the toggle.
  useMemo(() => {
    followRobotSV.value = followRobot;
  }, [followRobot]);

  // Sync robotMapPixelSV during render (not in a post-render effect) so the
  // shared value is written in the same frame as the content that depends on
  // robotPose / mapData.  This eliminates the 1-frame lag between the
  // useDerivedValue group matrix and the React-rendered Skia nodes.
  useMemo(() => {
    if (robotPose && mapData) {
      robotMapPixelSV.value = {
        gx: (robotPose.x - mapData.info.origin.x) / mapData.info.resolution,
        gy: mapData.info.height - (robotPose.y - mapData.info.origin.y) / mapData.info.resolution,
      };
    } else if (robotPose) {
      robotMapPixelSV.value = { gx: robotPose.x, gy: robotPose.y };
    } else {
      robotMapPixelSV.value = null;
    }
  }, [robotPose, mapData]);

  // Determine if we have any renderable data
  const hasAnyData =
    mapData !== null || scanPoints.length > 0 || robotPose !== null;

  // Empty state timer: show after 3s connected with no data at all
  useEffect(() => {
    if (status === "connected" && !hasAnyData) {
      const timer = setTimeout(() => setShowEmptyState(true), 3000);
      return () => clearTimeout(timer);
    }
    setShowEmptyState(false);
  }, [status, hasAnyData]);

  // Auto-enable follow mode in robot-centric view (no map)
  useEffect(() => {
    if (!mapData && robotPose && !followRobot) {
      setFollowRobot(true);
    }
  }, [mapData, robotPose]);

  // Map subscription deferred conversion refs
  const pendingMapMsgRef = useRef<any>(null);
  const mapConversionPendingRef = useRef(false);

  // Global costmap deferred conversion refs
  const pendingGlobalCostmapMsgRef = useRef<any>(null);
  const globalCostmapConversionPendingRef = useRef(false);

  // Local costmap deferred conversion refs
  const pendingLocalCostmapMsgRef = useRef<any>(null);
  const localCostmapConversionPendingRef = useRef(false);

  // --- Subscriptions (unchanged) ---

  // Map subscription
  useEffect(() => {
    if (!transport || status !== "connected") return;
    const sub = transport.subscribe(
      topic,
      "nav_msgs/msg/OccupancyGrid",
      (msg: any) => {
        pendingMapMsgRef.current = msg;
        if (!mapConversionPendingRef.current) {
          mapConversionPendingRef.current = true;
          setTimeout(() => {
            mapConversionPendingRef.current = false;
            const latest = pendingMapMsgRef.current;
            if (!latest) return;
            const info: MapInfo = {
              width: latest.info?.width || 0,
              height: latest.info?.height || 0,
              resolution: latest.info?.resolution || 0.05,
              origin: {
                x: latest.info?.origin?.position?.x || 0,
                y: latest.info?.origin?.position?.y || 0,
              },
            };
            if (info.width === 0 || info.height === 0) return;
            const pixels = occupancyGridToPixels(latest.data, info.width, info.height);
            setMapData({ pixels, info });
          }, 0);
        }
      },
    );
    return () => sub.unsubscribe();
  }, [transport, status, topic]);

  // Global costmap
  useEffect(() => {
    if (!transport || status !== "connected" || !globalCostmapTopic) {
      setGlobalCostmap(null);
      return;
    }
    const sub = transport.subscribe(
      globalCostmapTopic,
      "nav_msgs/msg/OccupancyGrid",
      (msg: any) => {
        pendingGlobalCostmapMsgRef.current = msg;
        if (!globalCostmapConversionPendingRef.current) {
          globalCostmapConversionPendingRef.current = true;
          setTimeout(() => {
            globalCostmapConversionPendingRef.current = false;
            const latest = pendingGlobalCostmapMsgRef.current;
            if (!latest) return;
            const info: MapInfo = {
              width: latest.info?.width || 0,
              height: latest.info?.height || 0,
              resolution: latest.info?.resolution || 0.05,
              origin: {
                x: latest.info?.origin?.position?.x || 0,
                y: latest.info?.origin?.position?.y || 0,
              },
            };
            if (info.width === 0 || info.height === 0) return;
            const frameId = (latest.header?.frame_id || "map").replace(/^\//, "");
            setGlobalCostmap({
              pixels: costmapGridToPixels(latest.data, info.width, info.height),
              info,
              frameId,
            });
          }, 0);
        }
      },
    );
    return () => sub.unsubscribe();
  }, [transport, status, globalCostmapTopic]);

  // Local costmap
  useEffect(() => {
    if (!transport || status !== "connected" || !localCostmapTopic) {
      setLocalCostmap(null);
      return;
    }
    const sub = transport.subscribe(
      localCostmapTopic,
      "nav_msgs/msg/OccupancyGrid",
      (msg: any) => {
        pendingLocalCostmapMsgRef.current = msg;
        if (!localCostmapConversionPendingRef.current) {
          localCostmapConversionPendingRef.current = true;
          setTimeout(() => {
            localCostmapConversionPendingRef.current = false;
            const latest = pendingLocalCostmapMsgRef.current;
            if (!latest) return;
            const info: MapInfo = {
              width: latest.info?.width || 0,
              height: latest.info?.height || 0,
              resolution: latest.info?.resolution || 0.05,
              origin: {
                x: latest.info?.origin?.position?.x || 0,
                y: latest.info?.origin?.position?.y || 0,
              },
            };
            if (info.width === 0 || info.height === 0) return;
            const frameId = (latest.header?.frame_id || "odom").replace(/^\//, "");
            setLocalCostmap({
              pixels: costmapGridToPixels(latest.data, info.width, info.height),
              info,
              frameId,
            });
          }, 0);
        }
      },
    );
    return () => sub.unsubscribe();
  }, [transport, status, localCostmapTopic]);

  // TF (dynamic + static) — builds full transform tree, derives robot pose and map->odom
  useEffect(() => {
    if (!transport || status !== "connected") return;
    const handleTf = (msg: any) => {
      const transforms: any[] = msg.transforms || [];
      let updated = false;
      for (const t of transforms) {
        const parent = (t.header?.frame_id || "").replace(/^\//, "");
        const child = (t.child_frame_id || "").replace(/^\//, "");
        if (!parent || !child) continue;
        const pos = t.transform?.translation || { x: 0, y: 0 };
        const rot = t.transform?.rotation || { x: 0, y: 0, z: 0, w: 1 };
        if (!tfTransformsRef.current.has(parent)) {
          tfTransformsRef.current.set(parent, new Map());
        }
        tfTransformsRef.current
          .get(parent)!
          .set(child, { x: pos.x, y: pos.y, yaw: quaternionToYaw(rot) });
        updated = true;
      }
      if (!updated) return;
      const robotTf = lookupTransform(
        tfTransformsRef.current,
        mapFrame,
        robotFrame,
      );
      if (robotTf) robotPoseRef.current = robotTf;
      const mapOdomTf = lookupTransform(tfTransformsRef.current, "map", "odom");
      if (mapOdomTf) mapToOdomRef.current = mapOdomTf;
      scheduleStateFlush();
    };
    const sub1 = transport.subscribe("/tf", "tf2_msgs/msg/TFMessage", handleTf);
    const sub2 = transport.subscribe(
      "/tf_static",
      "tf2_msgs/msg/TFMessage",
      handleTf,
    );
    return () => {
      sub1.unsubscribe();
      sub2.unsubscribe();
      tfTransformsRef.current = new Map();
    };
  }, [transport, status, mapFrame, robotFrame]);

  // LaserScan
  useEffect(() => {
    if (!transport || status !== "connected") return;
    const sub = transport.subscribe(
      scanTopic,
      "sensor_msgs/msg/LaserScan",
      (msg: any) => {
        scanFrameIdRef.current = (msg.header?.frame_id || "").replace(
          /^\//,
          "",
        );
        scanPointsRef.current = laserScanToPoints(msg);
        scheduleStateFlush();
      },
      throttleRate,
    );
    return () => sub.unsubscribe();
  }, [transport, status, scanTopic, throttleRate]);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  // --- Gestures ---
  const disableFollow = useCallback(() => {
    setFollowRobot(false);
  }, []);

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedZoomSV.value = zoomSV.value;
    })
    .onUpdate((e) => {
      zoomSV.value = Math.max(0.5, Math.min(10, savedZoomSV.value * e.scale));
    });

  const panGesture = Gesture.Pan()
    .onStart(() => {
      if (followRobotSV.value) {
        const mp = robotMapPixelSV.value;
        const s  = fitScaleSV.value * zoomSV.value;
        if (mp) {
          savedPanXSV.value = -(mp.gx - mapWidthSV.value / 2) * s;
          savedPanYSV.value = -(mp.gy - mapHeightSV.value / 2) * s;
        } else {
          savedPanXSV.value = 0;
          savedPanYSV.value = 0;
        }
        followRobotSV.value = false; // synchronous — no race with groupMatrix
      } else {
        savedPanXSV.value = panXSV.value;
        savedPanYSV.value = panYSV.value;
      }
      runOnJS(disableFollow)();
    })
    .onUpdate((e) => {
      panXSV.value = savedPanXSV.value + e.translationX;
      panYSV.value = savedPanYSV.value + e.translationY;
    });

  // --- Determine rendering mode ---
  const hasMap = mapData !== null;

  // Robot pose is already in map frame (derived from TF chain lookup)
  const robotInMap = robotPose;

  // Scan frame origin in map frame — uses TF to correctly place the sensor, falls back to robot pose
  const scanOrigin =
    (scanFrameIdRef.current
      ? lookupTransform(
          tfTransformsRef.current,
          mapFrame,
          scanFrameIdRef.current,
        )
      : null) ?? robotInMap;

  // --- Animated group matrix for Mode A (map-pixel space) ---
  const groupMatrix = useDerivedValue((): Matrix4 => {
    const s  = fitScaleSV.value * zoomSV.value;
    const mW = mapWidthSV.value;
    const mH = mapHeightSV.value;
    const cW = canvasWSV.value;
    const cH = canvasHSV.value;

    let px = panXSV.value;
    let py = panYSV.value;

    if (followRobotSV.value) {
      const mp = robotMapPixelSV.value;
      if (mp) {
        px = -(mp.gx - mW / 2) * s;
        py = -(mp.gy - mH / 2) * s;
      }
    }

    // T(cW/2+px, cH/2+py) · S(s) · T(-mW/2, -mH/2)
    return multiply4(
      translate(cW / 2 + px, cH / 2 + py, 0),
      multiply4(scale(s, s, 1), translate(-mW / 2, -mH / 2, 0)),
    );
  });

  // --- Animated group matrix for Mode B (robot-centric, world-coord space) ---
  const groupMatrixB = useDerivedValue((): Matrix4 => {
    const s  = basePpmSV.value * zoomSV.value;
    const cW = canvasWSV.value;
    const cH = canvasHSV.value;
    const px = followRobotSV.value ? 0 : panXSV.value;
    const py = followRobotSV.value ? 0 : panYSV.value;
    // robotMapPixelSV stores world coords when there's no map
    const mp = robotMapPixelSV.value;
    const cx = followRobotSV.value && mp ? mp.gx : 0;
    const cy = followRobotSV.value && mp ? mp.gy : 0;
    // T(cW/2+px, cH/2+py) · S(s) · T(-cx, cy)  — Y axis inverted in canvas
    return multiply4(
      translate(cW / 2 + px, cH / 2 + py, 0),
      multiply4(scale(s, s, 1), translate(-cx, cy, 0)),
    );
  });

  // --- Memoized Mode B scan vecs in world coordinates ---
  const scanVecsModeBMemo = useMemo(() => {
    const scanOriginB = scanOrigin ?? (robotPose as RobotPose | null) ?? { x: 0, y: 0, yaw: 0 };
    return scanPoints.map(([px, py]) => {
      const cos = Math.cos(scanOriginB.yaw);
      const sin = Math.sin(scanOriginB.yaw);
      const wx = scanOriginB.x + px * cos - py * sin;
      const wy = scanOriginB.y + px * sin + py * cos;
      return vec(wx, -wy); // Y-flipped world coords
    });
  }, [scanPoints, robotPose]);

  // --- Memoized elements in map-pixel space ---
  const robotPathMemo = useMemo(() => {
    if (!robotPose || !mapData) return null;
    const gx = (robotPose.x - mapData.info.origin.x) / mapData.info.resolution;
    const gy = mapData.info.height - (robotPose.y - mapData.info.origin.y) / mapData.info.resolution;
    const fitScale = Math.min(width / mapData.info.width, height / mapData.info.height);
    const size = 8 / fitScale;
    const canvasYaw = flipIndicator ? Math.PI - robotPose.yaw : -robotPose.yaw;
    const path = Skia.Path.Make();
    path.moveTo(gx + size * Math.cos(canvasYaw), gy + size * Math.sin(canvasYaw));
    path.lineTo(gx + size * 0.6 * Math.cos(canvasYaw + 2.5), gy + size * 0.6 * Math.sin(canvasYaw + 2.5));
    path.lineTo(gx + size * 0.6 * Math.cos(canvasYaw - 2.5), gy + size * 0.6 * Math.sin(canvasYaw - 2.5));
    path.close();
    return path;
  }, [robotPose, flipIndicator, mapData?.info, width, height]);

  const goalPathMemo = useMemo(() => {
    if (!goalPosition || !mapData) return null;
    const gx = (goalPosition.x - mapData.info.origin.x) / mapData.info.resolution;
    const gy = mapData.info.height - (goalPosition.y - mapData.info.origin.y) / mapData.info.resolution;
    const fitScale = Math.min(width / mapData.info.width, height / mapData.info.height);
    const crossSize = 6 / fitScale;
    const path = Skia.Path.Make();
    path.moveTo(gx - crossSize, gy - crossSize);
    path.lineTo(gx + crossSize, gy + crossSize);
    path.moveTo(gx + crossSize, gy - crossSize);
    path.lineTo(gx - crossSize, gy + crossSize);
    return path;
  }, [goalPosition, mapData?.info, width, height]);

  const scanVecsMemo = useMemo(() => {
    if (!mapData) return [];
    // Compute scanOrigin inside memo to avoid stale closure
    const memoScanOrigin =
      (scanFrameIdRef.current
        ? lookupTransform(tfTransformsRef.current, mapFrame, scanFrameIdRef.current)
        : null) ?? robotPose;
    if (!memoScanOrigin) return [];
    return scanPoints.map(([px, py]) => {
      const cos = Math.cos(memoScanOrigin.yaw);
      const sin = Math.sin(memoScanOrigin.yaw);
      const wx = memoScanOrigin.x + px * cos - py * sin;
      const wy = memoScanOrigin.y + px * sin + py * cos;
      const gx = (wx - mapData.info.origin.x) / mapData.info.resolution;
      const gy = mapData.info.height - (wy - mapData.info.origin.y) / mapData.info.resolution;
      return vec(gx, gy);
    });
  }, [scanPoints, robotPose, mapToOdom, mapData?.info]);

  const globalCostmapGeom = useMemo(() => {
    if (!globalCostmap || !mapData) return null;
    const cmInfo = globalCostmap.info;
    const mapInfo = mapData.info;
    const cmW_px = cmInfo.width  * (cmInfo.resolution / mapInfo.resolution);
    const cmH_px = cmInfo.height * (cmInfo.resolution / mapInfo.resolution);
    if (globalCostmap.frameId === 'map') {
      const cmLeft = (cmInfo.origin.x - mapInfo.origin.x) / mapInfo.resolution;
      const cmTop  = mapInfo.height - (cmInfo.origin.y + cmInfo.height * cmInfo.resolution - mapInfo.origin.y) / mapInfo.resolution;
      return { type: 'map' as const, cmLeft, cmTop, cmW_px, cmH_px };
    } else {
      const cx_odom = cmInfo.origin.x + (cmInfo.width * cmInfo.resolution) / 2;
      const cy_odom = cmInfo.origin.y + (cmInfo.height * cmInfo.resolution) / 2;
      const center_map = applyTransform({ x: cx_odom, y: cy_odom, yaw: 0 }, mapToOdom);
      const gx_c = (center_map.x - mapInfo.origin.x) / mapInfo.resolution;
      const gy_c = mapInfo.height - (center_map.y - mapInfo.origin.y) / mapInfo.resolution;
      return { type: 'odom' as const, gx_c, gy_c, cmW_px, cmH_px, yaw: -mapToOdom.yaw };
    }
  }, [globalCostmap, mapData, mapToOdom]);

  const localCostmapGeom = useMemo(() => {
    if (!localCostmap || !mapData) return null;
    const cmInfo = localCostmap.info;
    const mapInfo = mapData.info;
    const cmW_px = cmInfo.width  * (cmInfo.resolution / mapInfo.resolution);
    const cmH_px = cmInfo.height * (cmInfo.resolution / mapInfo.resolution);
    if (localCostmap.frameId === 'map') {
      const cmLeft = (cmInfo.origin.x - mapInfo.origin.x) / mapInfo.resolution;
      const cmTop  = mapInfo.height - (cmInfo.origin.y + cmInfo.height * cmInfo.resolution - mapInfo.origin.y) / mapInfo.resolution;
      return { type: 'map' as const, cmLeft, cmTop, cmW_px, cmH_px };
    } else {
      const cx_odom = cmInfo.origin.x + (cmInfo.width * cmInfo.resolution) / 2;
      const cy_odom = cmInfo.origin.y + (cmInfo.height * cmInfo.resolution) / 2;
      const center_map = applyTransform({ x: cx_odom, y: cy_odom, yaw: 0 }, mapToOdom);
      const gx_c = (center_map.x - mapInfo.origin.x) / mapInfo.resolution;
      const gy_c = mapInfo.height - (center_map.y - mapInfo.origin.y) / mapInfo.resolution;
      return { type: 'odom' as const, gx_c, gy_c, cmW_px, cmH_px, yaw: -mapToOdom.yaw };
    }
  }, [localCostmap, mapData, mapToOdom]);

  // --- Empty state (must be after all hooks) ---
  if (!hasAnyData) {
    return (
      <View style={[styles.container, { width, height }]}>
        {showEmptyState && status === "connected" ? (
          <WidgetEmptyState widgetType="map" topicName={topic} />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>
              {status !== "connected" ? "Not connected" : "Waiting for data..."}
            </Text>
          </View>
        )}
      </View>
    );
  }

  // ===========================
  // MODE A: Map-based rendering
  // ===========================
  if (hasMap) {
    const handleLongPress = (cx: number, cy: number) => {
      if (!transport || !enableNav2Goal || !mapData) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const fitScale = Math.min(width / mapData.info.width, height / mapData.info.height);
      const effectivePanX = followRobot && robotPose
        ? -(robotMapPixelSV.value?.gx ?? 0 - mapData.info.width / 2) * fitScale * zoomSV.value
        : panXSV.value;
      const effectivePanY = followRobot && robotPose
        ? -(robotMapPixelSV.value?.gy ?? 0 - mapData.info.height / 2) * fitScale * zoomSV.value
        : panYSV.value;
      const [wx, wy] = canvasToWorld(
        cx, cy, mapData.info, width, height,
        fitScale, zoomSV.value, effectivePanX, effectivePanY,
      );
      const now = Date.now();
      transport.publish(nav2GoalTopic, 'geometry_msgs/msg/PoseStamped', {
        header: {
          stamp: { sec: Math.floor(now / 1000), nanosec: (now % 1000) * 1_000_000 },
          frame_id: 'map',
        },
        pose: {
          position: { x: wx, y: wy, z: 0 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
      });
      setGoalPosition({ x: wx, y: wy });
    };

    const longPressGesture = Gesture.LongPress()
      .minDuration(500)
      .onEnd((e, success) => {
        if (success) runOnJS(handleLongPress)(e.x, e.y);
      });

    const finalGesture = enableNav2Goal
      ? Gesture.Race(longPressGesture, Gesture.Simultaneous(pinchGesture, panGesture))
      : Gesture.Simultaneous(pinchGesture, panGesture);

    return (
      <View style={[styles.container, { width, height }]}>
        <GestureDetector gesture={finalGesture}>
          <View style={StyleSheet.absoluteFill}>
            <Canvas style={StyleSheet.absoluteFill}>
              <Group matrix={groupMatrix}>
                {skiaImage && (
                  <SkiaImage
                    image={skiaImage}
                    x={0}
                    y={0}
                    width={mapData.info.width}
                    height={mapData.info.height}
                  />
                )}
                {globalCostmapImage && globalCostmapGeom && (() => {
                  if (globalCostmapGeom.type === 'map') {
                    return (
                      <SkiaImage
                        image={globalCostmapImage}
                        x={globalCostmapGeom.cmLeft}
                        y={globalCostmapGeom.cmTop}
                        width={globalCostmapGeom.cmW_px}
                        height={globalCostmapGeom.cmH_px}
                        opacity={0.5}
                      />
                    );
                  }
                  return (
                    <Group
                      transform={[
                        { translateX: globalCostmapGeom.gx_c },
                        { translateY: globalCostmapGeom.gy_c },
                        { rotate: globalCostmapGeom.yaw },
                      ]}
                      opacity={0.5}
                    >
                      <SkiaImage
                        image={globalCostmapImage}
                        x={-globalCostmapGeom.cmW_px / 2}
                        y={-globalCostmapGeom.cmH_px / 2}
                        width={globalCostmapGeom.cmW_px}
                        height={globalCostmapGeom.cmH_px}
                      />
                    </Group>
                  );
                })()}
                {localCostmapImage && localCostmapGeom && (() => {
                  if (localCostmapGeom.type === 'map') {
                    return (
                      <SkiaImage
                        image={localCostmapImage}
                        x={localCostmapGeom.cmLeft}
                        y={localCostmapGeom.cmTop}
                        width={localCostmapGeom.cmW_px}
                        height={localCostmapGeom.cmH_px}
                        opacity={0.5}
                      />
                    );
                  }
                  return (
                    <Group
                      transform={[
                        { translateX: localCostmapGeom.gx_c },
                        { translateY: localCostmapGeom.gy_c },
                        { rotate: localCostmapGeom.yaw },
                      ]}
                      opacity={0.5}
                    >
                      <SkiaImage
                        image={localCostmapImage}
                        x={-localCostmapGeom.cmW_px / 2}
                        y={-localCostmapGeom.cmH_px / 2}
                        width={localCostmapGeom.cmW_px}
                        height={localCostmapGeom.cmH_px}
                      />
                    </Group>
                  );
                })()}
                {scanVecsMemo.length > 0 && (
                  <Points
                    points={scanVecsMemo}
                    mode="points"
                    color={theme.colors.accentPrimary}
                    style="stroke"
                    strokeWidth={2 / (fitScaleSV.value * zoomSV.value)}
                  />
                )}
                {robotPathMemo && (
                  <Path
                    path={robotPathMemo}
                    color={theme.colors.statusConnected}
                    style="fill"
                  />
                )}
                {goalPathMemo && (
                  <Path
                    path={goalPathMemo}
                    color={theme.colors.statusError}
                    style="stroke"
                    strokeWidth={2 / (fitScaleSV.value * zoomSV.value)}
                  />
                )}
              </Group>
            </Canvas>
          </View>
        </GestureDetector>
        <View style={styles.compass}>
          <Text style={styles.compassText}>N</Text>
        </View>
        <MapControls
          followRobot={followRobot}
          onZoomIn={() => { zoomSV.value = Math.min(10, zoomSV.value * 1.5); }}
          onZoomOut={() => { zoomSV.value = Math.max(0.5, zoomSV.value / 1.5); }}
          onReset={() => {
            setFollowRobot(false);
            zoomSV.value = 1;
            panXSV.value = 0;
            panYSV.value = 0;
          }}
          onFollow={() => {
            setFollowRobot((f) => !f);
          }}
        />
      </View>
    );
  }

  // ====================================
  // MODE B: Robot-centric (no map data)
  // ====================================
  // basePpm = pixels per meter at zoom=1
  const basePpm = Math.min(width, height) / 20;

  // Grid lines in world-unit space (meters), Y-flipped
  const gridPath = Skia.Path.Make();
  const gridSpacingPx = basePpm * zoomSV.value; // approx spacing — read .value on JS thread
  if (gridSpacingPx > 8) {
    const cx = robotPose?.x ?? 0;
    const cy = robotPose?.y ?? 0;
    const halfW = (width / 2) / (basePpm * zoomSV.value);
    const halfH = (height / 2) / (basePpm * zoomSV.value);
    for (let x = Math.floor(cx - halfW) - 1; x <= cx + halfW + 1; x++) {
      gridPath.moveTo(x, -100);
      gridPath.lineTo(x, 100);
    }
    for (let y = Math.floor(-cy - halfH) - 1; y <= -cy + halfH + 1; y++) {
      gridPath.moveTo(-100, y);
      gridPath.lineTo(100, y);
    }
  }

  // Robot marker in world coords
  let robotPathB: ReturnType<typeof Skia.Path.Make> | null = null;
  if (robotPose) {
    const size = 8 / (basePpm * zoomSV.value);
    const canvasYaw = flipIndicator ? Math.PI - robotPose.yaw : -robotPose.yaw;
    robotPathB = Skia.Path.Make();
    robotPathB.moveTo(robotPose.x + size * Math.cos(canvasYaw), -robotPose.y + size * Math.sin(canvasYaw));
    robotPathB.lineTo(robotPose.x + size * 0.6 * Math.cos(canvasYaw + 2.5), -robotPose.y + size * 0.6 * Math.sin(canvasYaw + 2.5));
    robotPathB.lineTo(robotPose.x + size * 0.6 * Math.cos(canvasYaw - 2.5), -robotPose.y + size * 0.6 * Math.sin(canvasYaw - 2.5));
    robotPathB.close();
  }

  return (
    <View style={[styles.container, { width, height }]}>
      <GestureDetector gesture={Gesture.Simultaneous(pinchGesture, panGesture)}>
        <View style={StyleSheet.absoluteFill}>
          <Canvas style={StyleSheet.absoluteFill}>
            <Group matrix={groupMatrixB}>
              <Path path={gridPath} color="#1A1A1A" style="stroke" strokeWidth={0.5 / (basePpm * zoomSV.value)} />
              {scanVecsModeBMemo.length > 0 && (
                <Points
                  points={scanVecsModeBMemo}
                  mode="points"
                  color={theme.colors.accentPrimary}
                  style="stroke"
                  strokeWidth={2 / (basePpm * zoomSV.value)}
                />
              )}
              {robotPathB && (
                <Path path={robotPathB} color={theme.colors.statusConnected} style="fill" />
              )}
              {!robotPose && (() => {
                const crossPath = Skia.Path.Make();
                const cs = 6 / (basePpm * zoomSV.value);
                crossPath.moveTo(-cs, 0); crossPath.lineTo(cs, 0);
                crossPath.moveTo(0, -cs); crossPath.lineTo(0, cs);
                return <Path path={crossPath} color={theme.colors.textMuted} style="stroke" strokeWidth={1 / (basePpm * zoomSV.value)} />;
              })()}
            </Group>
          </Canvas>
        </View>
      </GestureDetector>
      <MapControls
        followRobot={followRobot}
        onZoomIn={() => {
          zoomSV.value = Math.min(10, zoomSV.value * 1.5);
        }}
        onZoomOut={() => {
          zoomSV.value = Math.max(0.5, zoomSV.value / 1.5);
        }}
        onReset={() => {
          setFollowRobot(false);
          zoomSV.value = 1;
          panXSV.value = 0;
          panYSV.value = 0;
        }}
        onFollow={() => {
          setFollowRobot((f) => !f);
          if (!followRobot) {
            panXSV.value = 0;
            panYSV.value = 0;
          }
        }}
      />
    </View>
  );
}

function MapControls({
  followRobot,
  onZoomIn,
  onZoomOut,
  onReset,
  onFollow,
}: {
  followRobot: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFollow: () => void;
}) {
  return (
    <View style={styles.zoomControls}>
      <TouchableOpacity style={styles.zoomButton} onPress={onZoomIn}>
        <Text style={styles.zoomButtonText}>+</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.zoomButton} onPress={onZoomOut}>
        <Text style={styles.zoomButtonText}>-</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.zoomButton} onPress={onReset}>
        <Text style={styles.zoomButtonText}>R</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.zoomButton, followRobot && styles.zoomButtonActive]}
        onPress={onFollow}
      >
        <Text
          style={[
            styles.zoomButtonText,
            followRobot && styles.zoomButtonTextActive,
          ]}
        >
          F
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#000", overflow: "hidden" },
  placeholder: { flex: 1, justifyContent: "center", alignItems: "center" },
  placeholderText: {
    fontFamily: "SpaceMono",
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  compass: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    justifyContent: "center",
    alignItems: "center",
  },
  compassText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  zoomControls: { position: "absolute", bottom: 8, right: 8, gap: 4 },
  zoomButton: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    justifyContent: "center",
    alignItems: "center",
  },
  zoomButtonText: {
    fontFamily: "SpaceMono",
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  zoomButtonActive: {
    backgroundColor: theme.colors.accentPrimary,
    borderColor: theme.colors.accentPrimary,
  },
  zoomButtonTextActive: { color: "#FFFFFF" },
});
