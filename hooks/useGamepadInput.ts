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

export function useGamepadInput() {
  const mappingsRef = useRef<StickMapping[]>([]);
  const trackedTopicsRef = useRef<Set<string>>(new Set());

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

  // Connection listener — zero axes on disconnect
  useEffect(() => {
    const sub = addConnectionListener((event) => {
      useGamepadStore.getState().setConnected(event.connected, event.name);
      if (!event.connected) {
        const { clearAxes } = useCmdVelStore.getState();
        for (const topic of trackedTopicsRef.current) {
          clearAxes(topic, [
            'linear.x', 'linear.y', 'linear.z',
            'angular.x', 'angular.y', 'angular.z',
          ] as TwistField[]);
        }
        trackedTopicsRef.current.clear();
      }
    });
    return () => sub.remove();
  }, []);

  // Axis listener
  useEffect(() => {
    const sub = addAxisListener((event) => {
      processAxes(event);
    });
    return () => sub.remove();
  }, []);

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
        const rawX = xStick === 'left' ? -event.leftX : -event.rightX;
        axes[xField] = applyDeadzone(rawX, deadzone) * (config.xAxisScale ?? 1);
      }
      if (yStick !== 'none') {
        const rawY = yStick === 'left' ? -event.leftY : -event.rightY;
        axes[yField] = applyDeadzone(rawY, deadzone) * (config.yAxisScale ?? 0.5);
      }

      setAxes(topic, axes);
    }
  }
}
