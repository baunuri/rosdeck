import { useEffect, useRef } from 'react';
import { addAxisListener, addConnectionListener } from '../modules/expo-gamepad/src';
import { useGamepadStore } from '../stores/useGamepadStore';
import { useCmdVelStore } from '../stores/useCmdVelStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useLayoutStore } from '../stores/useLayoutStore';
import {
  collectJoystickWidgets,
  resolveStickMappings,
  applyDeadzone,
  type StickMapping,
} from '../lib/gamepad-mapping';
import type { TwistField } from '../lib/ros';
import type { GamepadStickEvent } from '../modules/expo-gamepad/src';

const WATCHDOG_TIMEOUT = 500;

export function useGamepadInput() {
  const mappingsRef = useRef<StickMapping[]>([]);
  const watchdogRef = useRef<ReturnType<typeof setTimeout>>();
  const trackedTopicsRef = useRef<Set<string>>(new Set());

  // Cache widget list — recompute only when active layout tree changes.
  // Uses manual comparison (same pattern as useCmdVelPublisher.ts:19-37)
  // since useLayoutStore does not use subscribeWithSelector middleware.
  const lastTreeRef = useRef<any>(null);
  const lastAutoLayoutRef = useRef<string>('');

  const recomputeMappings = () => {
    const layout = useLayoutStore.getState().getActiveLayout();
    const tree = layout?.tree ?? null;
    const autoLayout = useSettingsStore.getState().gamepadAutoLayout;

    if (tree === lastTreeRef.current && autoLayout === lastAutoLayoutRef.current) return;
    lastTreeRef.current = tree;
    lastAutoLayoutRef.current = autoLayout;

    if (!tree) {
      mappingsRef.current = [];
      useGamepadStore.getState().setResolvedMappings({});
      return;
    }
    const widgets = collectJoystickWidgets(tree);
    const resolved = resolveStickMappings(widgets, autoLayout);
    mappingsRef.current = resolved;

    const mappingRecord: Record<string, 'left' | 'right' | 'split' | 'none'> = {};
    for (const m of resolved) {
      mappingRecord[m.nodeId] = m.xStick === 'none' && m.yStick === 'none' ? 'none'
        : m.xStick !== m.yStick ? 'split'
        : m.xStick;
    }
    useGamepadStore.getState().setResolvedMappings(mappingRecord);
  };

  useEffect(() => {
    recomputeMappings();
    const unsub1 = useLayoutStore.subscribe(recomputeMappings);
    const unsub2 = useSettingsStore.subscribe(recomputeMappings);
    return () => { unsub1(); unsub2(); };
  }, []);

  // Connection listener
  useEffect(() => {
    const sub = addConnectionListener((event) => {
      useGamepadStore.getState().setConnected(event.connected, event.name);
      if (!event.connected) {
        zeroAllAxes();
      }
    });
    return () => sub.remove();
  }, []);

  // Axis listener
  useEffect(() => {
    const sub = addAxisListener((event) => {
      resetWatchdog();
      processAxes(event);
    });
    return () => {
      sub.remove();
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
    };
  }, []);

  function resetWatchdog() {
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    // The watchdog guards against lost Bluetooth connections (no clean disconnect event).
    // It does NOT set connected=false — that would cause false disconnects when the
    // stick is simply idle. Instead it only zeros axes as a safety measure.
    // The native module handles actual connect/disconnect events.
    watchdogRef.current = setTimeout(() => {
      zeroAllAxes();
    }, WATCHDOG_TIMEOUT);
  }

  function zeroAllAxes() {
    const { clearAxes } = useCmdVelStore.getState();
    for (const topic of trackedTopicsRef.current) {
      clearAxes(topic, [
        'linear.x', 'linear.y', 'linear.z',
        'angular.x', 'angular.y', 'angular.z',
      ] as TwistField[]);
    }
    trackedTopicsRef.current.clear();
  }

  function processAxes(event: GamepadStickEvent) {
    const deadzone = useSettingsStore.getState().gamepadDeadzone;
    const { setAxes } = useCmdVelStore.getState();

    for (const mapping of mappingsRef.current) {
      const { config, xStick, yStick } = mapping;
      if (xStick === 'none' && yStick === 'none') continue;

      const topic = config.topic;
      trackedTopicsRef.current.add(topic);

      const xField = `${config.xAxisGroup ?? 'angular'}.${config.xAxisComponent ?? 'z'}` as TwistField;
      const yField = `${config.yAxisGroup ?? 'linear'}.${config.yAxisComponent ?? 'x'}` as TwistField;

      const axes: Partial<Record<TwistField, number>> = {};

      if (xStick !== 'none') {
        // Negate X to match touch joystick convention (calculateVelocity negates both axes)
        const rawX = xStick === 'left' ? -event.leftX : -event.rightX;
        axes[xField] = applyDeadzone(rawX, deadzone) * (config.xAxisScale ?? 1);
      }
      if (yStick !== 'none') {
        // Gamepad Y is inverted: push forward = negative. Negate to match convention.
        const rawY = yStick === 'left' ? -event.leftY : -event.rightY;
        axes[yField] = applyDeadzone(rawY, deadzone) * (config.yAxisScale ?? 0.5);
      }

      setAxes(topic, axes);
    }
  }
}
