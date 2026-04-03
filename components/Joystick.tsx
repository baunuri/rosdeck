import * as Haptics from "../lib/haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, Vibration, View } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { DEFAULTS } from "../constants/defaults";
import { theme } from "../constants/theme";
import { type TwistField } from "../lib/ros";
import { useCmdVelPublisher } from "../hooks/useCmdVelPublisher";
import { useCmdVelStore } from "../stores/useCmdVelStore";
import { useGamepadStore } from '../stores/useGamepadStore';
import type { WidgetProps } from "../types/layout";
import { registerTouchEntry, unregisterTouchEntry, updateTouchBounds } from "../lib/touch-dispatcher";

const lightTick = () => {
  if (Platform.OS === "ios") {
    Haptics.selectionAsync();
  } else {
    Vibration.vibrate(10);
  }
};

const SPRING_CONFIG = theme.joystick.springConfig;

// Exported for testing
// Returns normalized joystick values: nx right=-1 left=+1, ny up=+1 down=-1
export function calculateVelocity(
  dx: number,
  dy: number,
  radius: number,
): { nx: number; ny: number } {
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance === 0) return { nx: 0, ny: 0 };
  const clampedDist = Math.min(distance, radius);
  const angle = Math.atan2(dy, dx);
  return {
    nx: -(clampedDist * Math.cos(angle)) / radius,
    ny: -(clampedDist * Math.sin(angle)) / radius,
  };
}

export function Joystick(props?: Partial<WidgetProps>) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const activeProgress = useSharedValue(0); // 0 = idle, 1 = touched
  const radiusRef = useRef<number>(100);
  const [displayVelocity, setDisplayVelocity] = useState({ xValue: 0, yValue: 0 });
  const [showHint, setShowHint] = useState(true);

  const cmdVelTopic = props?.config?.topic || DEFAULTS.cmdVelTopic;
  const useTwistStamped = props?.config?.useTwistStamped ?? false;
  const frameId = props?.config?.frameId || "base_link";
  const xAxisGroup: 'linear' | 'angular' = props?.config?.xAxisGroup ?? 'angular';
  const xAxisComponent: 'x' | 'y' | 'z' = props?.config?.xAxisComponent ?? 'z';
  const xAxisScale: number = props?.config?.xAxisScale ?? 1.0;
  const yAxisGroup: 'linear' | 'angular' = props?.config?.yAxisGroup ?? 'linear';
  const yAxisComponent: 'x' | 'y' | 'z' = props?.config?.yAxisComponent ?? 'x';
  const yAxisScale: number = props?.config?.yAxisScale ?? 0.5;
  const xAxisField = `${xAxisGroup}.${xAxisComponent}` as TwistField;
  const yAxisField = `${yAxisGroup}.${yAxisComponent}` as TwistField;

  const setAxes = useCmdVelStore((s) => s.setAxes);
  const { publishNow } = useCmdVelPublisher(cmdVelTopic, useTwistStamped, frameId);

  const gamepadConnected = useGamepadStore((s) => s.connected);
  const nodeId = props?.nodeId;
  const resolvedStick = useGamepadStore((s) => nodeId ? s.resolvedMappings[nodeId] : undefined);
  const stickLabel = gamepadConnected && resolvedStick && resolvedStick !== 'none'
    ? resolvedStick === 'split' ? 'L+R'
      : resolvedStick === 'left' ? 'L' : 'R'
    : null;

  useEffect(() => {
    return () => {
      setAxes(cmdVelTopic, { [xAxisField]: 0, [yAxisField]: 0 });
    };
  }, [cmdVelTopic, xAxisField, yAxisField]);

  const displayVelocityRef = useRef({ xValue: 0, yValue: 0 });
  const displayRafScheduled = useRef(false);

  const updateVelocity = useCallback(
    (xVal: number, yVal: number) => {
      setAxes(cmdVelTopic, { [xAxisField]: xVal, [yAxisField]: yVal });
      displayVelocityRef.current = { xValue: xVal, yValue: yVal };
      if (!displayRafScheduled.current) {
        displayRafScheduled.current = true;
        requestAnimationFrame(() => {
          displayRafScheduled.current = false;
          setDisplayVelocity({ ...displayVelocityRef.current });
        });
      }
    },
    [cmdVelTopic, xAxisField, yAxisField, setAxes],
  );

  const stopJoystick = useCallback(() => {
    setAxes(cmdVelTopic, { [xAxisField]: 0, [yAxisField]: 0 });
    displayVelocityRef.current = { xValue: 0, yValue: 0 };
    setDisplayVelocity({ xValue: 0, yValue: 0 });
    publishNow();
  }, [cmdVelTopic, xAxisField, yAxisField, setAxes, publishNow]);

  // ─── Dispatcher-based touch handling ──────────────────────────────────────
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;
  const baseViewRef = useRef<View>(null);
  const wasAtEdgeRef = useRef(false);
  const prevSignXRef = useRef(0);
  const prevSignYRef = useRef(0);

  // Keep latest callback deps in refs so the registered entry never goes stale
  const xAxisScaleRef = useRef(xAxisScale);
  const yAxisScaleRef = useRef(yAxisScale);
  const updateVelocityRef = useRef(updateVelocity);
  const stopJoystickRef = useRef(stopJoystick);
  const gamepadConnectedRef = useRef(gamepadConnected);
  xAxisScaleRef.current = xAxisScale;
  yAxisScaleRef.current = yAxisScale;
  updateVelocityRef.current = updateVelocity;
  stopJoystickRef.current = stopJoystick;
  gamepadConnectedRef.current = gamepadConnected;

  // Register once on mount; handlers check gamepadConnectedRef to no-op when gamepad active
  useEffect(() => {
    registerTouchEntry(instanceId, {
      bounds: null,
      onTouchStart: (_touchId, _pageX, _pageY) => {
        if (gamepadConnectedRef.current) return;
        wasAtEdgeRef.current = false;
        prevSignXRef.current = 0;
        prevSignYRef.current = 0;
        activeProgress.value = withTiming(1, { duration: 80 });
        lightTick();
        setShowHint(false);
      },
      onTouchMove: (_touchId, dx, dy) => {
        if (gamepadConnectedRef.current) return;
        const r = radiusRef.current;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const hitEdge = dist >= r * 0.95;
        if (hitEdge && !wasAtEdgeRef.current) lightTick();
        wasAtEdgeRef.current = hitEdge;

        const threshold = r * 0.05;
        const signX = dx > threshold ? 1 : dx < -threshold ? -1 : 0;
        const signY = dy > threshold ? 1 : dy < -threshold ? -1 : 0;
        const crossedX = prevSignXRef.current !== 0 && signX !== 0 && signX !== prevSignXRef.current;
        const crossedY = prevSignYRef.current !== 0 && signY !== 0 && signY !== prevSignYRef.current;
        if (signX !== 0) prevSignXRef.current = signX;
        if (signY !== 0) prevSignYRef.current = signY;
        if (crossedX || crossedY) lightTick();

        const clampedDist = Math.min(dist, r);
        const angle = Math.atan2(dy, dx);
        translateX.value = clampedDist * Math.cos(angle);
        translateY.value = clampedDist * Math.sin(angle);

        const { nx, ny } = calculateVelocity(dx, dy, r);
        updateVelocityRef.current(nx * xAxisScaleRef.current, ny * yAxisScaleRef.current);
      },
      onTouchEnd: (_touchId) => {
        if (gamepadConnectedRef.current) return;
        activeProgress.value = withTiming(0, { duration: 200 });
        translateX.value = withSpring(0, SPRING_CONFIG);
        translateY.value = withSpring(0, SPRING_CONFIG);
        stopJoystickRef.current();
      },
    });
    return () => unregisterTouchEntry(instanceId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When gamepad is connected, animate knob from store values
  useEffect(() => {
    if (!gamepadConnected) return;

    const unsub = useCmdVelStore.subscribe((state) => {
      const axes = state.topics[cmdVelTopic] ?? {};
      const xVal = (axes[xAxisField] ?? 0) as number;
      const yVal = (axes[yAxisField] ?? 0) as number;
      const r = radiusRef.current;

      // Reverse the velocity→pixel mapping
      const knobX = -(xVal / xAxisScale) * r;
      const knobY = -(yVal / yAxisScale) * r;

      translateX.value = knobX;
      translateY.value = knobY;

      displayVelocityRef.current = { xValue: xVal, yValue: yVal };
      if (!displayRafScheduled.current) {
        displayRafScheduled.current = true;
        requestAnimationFrame(() => {
          displayRafScheduled.current = false;
          setDisplayVelocity({ ...displayVelocityRef.current });
        });
      }
    });

    return unsub;
  }, [gamepadConnected, cmdVelTopic, xAxisField, yAxisField, xAxisScale, yAxisScale]);

  // ─── Layout ───────────────────────────────────────────────────────────────
  const availWidth = props?.width || 300;
  const availHeight = props?.height || 300;
  const padding = 8;
  const readoutSpace = 20;
  const maxDiameter = Math.min(
    availWidth - padding * 2,
    availHeight - padding * 2 - readoutSpace,
  );
  const baseSize = Math.max(60, maxDiameter);
  const scaledKnob = Math.max(20, baseSize * 0.27);
  const scaledRadius = baseSize / 2 - scaledKnob / 2;

  useEffect(() => {
    radiusRef.current = scaledRadius;
  }, [scaledRadius]);

  const halfRadius = scaledRadius * 0.5;

  const knobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
    backgroundColor: interpolateColor(
      activeProgress.value,
      [0, 1],
      ['transparent', theme.colors.accentPrimary],
    ),
  }));

  return (
    <View style={styles.container}>
      <View
        ref={baseViewRef}
        style={[
          styles.base,
          { width: baseSize, height: baseSize, borderRadius: baseSize / 2 },
        ]}
        onLayout={() => {
          baseViewRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
            updateTouchBounds(instanceId, { x: pageX, y: pageY, width, height });
          });
        }}
      >
        <View style={[styles.crosshairH, { width: baseSize * 0.85 }]} />
        <View style={[styles.crosshairV, { height: baseSize * 0.85 }]} />
        <View
          style={[
            styles.referenceRing,
            {
              width: halfRadius * 2 + scaledKnob,
              height: halfRadius * 2 + scaledKnob,
              borderRadius: (halfRadius * 2 + scaledKnob) / 2,
            },
          ]}
        />
        <View style={styles.centerDot} />
        <Animated.View
          style={[
            styles.knob,
            {
              width: scaledKnob,
              height: scaledKnob,
              borderRadius: scaledKnob / 2,
            },
            knobStyle,
          ]}
        />
        {gamepadConnected && stickLabel && (
          <View style={styles.stickBadge}>
            <Text style={styles.stickBadgeText}>{stickLabel}</Text>
          </View>
        )}
      </View>

      <View style={styles.readout}>
        <Text style={styles.readoutText}>
          {xAxisField} {displayVelocity.xValue.toFixed(2)} ·{" "}
          {yAxisField} {displayVelocity.yValue.toFixed(2)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  base: {
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  crosshairH: {
    position: "absolute",
    height: 1,
    backgroundColor: "#FFFFFF0A",
  },
  crosshairV: {
    position: "absolute",
    width: 1,
    backgroundColor: "#FFFFFF0A",
  },
  referenceRing: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "#FFFFFF08",
  },
  centerDot: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#FFFFFF15",
  },
  knob: {
    borderWidth: 1.5,
    borderColor: "#5AAFFF",
    ...Platform.select({
      ios: {
        shadowColor: theme.colors.accentPrimary,
        shadowRadius: 10,
        shadowOpacity: 0.35,
        shadowOffset: { width: 0, height: 0 },
      },
      android: {
        filter: [
          {
            dropShadow: {
              offsetX: 0,
              offsetY: 0,
              standardDeviation: 6,
              color: theme.colors.accentPrimary + "88",
            },
          },
        ],
      },
    }),
  } as any,
  readout: {
    marginTop: 4,
  },
  readoutText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
  stickBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: theme.colors.accentPrimary + '33',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  stickBadgeText: {
    fontFamily: 'SpaceMono',
    fontSize: 8,
    color: theme.colors.accentPrimary,
    fontWeight: '700',
  },
});
