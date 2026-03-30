import { useEffect, useRef } from 'react';
import { buildTwistStampedMessage, createCmdVelTopic } from '../lib/ros';
import { useCmdVelStore } from '../stores/useCmdVelStore';
import { useRosStore } from '../stores/useRosStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import type { TwistMessage } from '../types/ros';
import type { TwistField } from '../lib/ros';

// Module-level singletons — one interval per topic, shared across all joystick instances.
// Using a Set of publish fns so that when one joystick unmounts, the interval
// seamlessly falls over to the next registered one.
const _intervals = new Map<string, ReturnType<typeof setInterval>>();
const _publishFns = new Map<string, Set<() => void>>();

// Restart all active intervals when publish rate changes.
// Set up once at module load time; runs for app lifetime.
// Uses single-argument subscribe (works without subscribeWithSelector middleware)
// with manual comparison against a cached previous value.
let _lastPublishRate = useSettingsStore.getState().publishRateHz;
useSettingsStore.subscribe((state) => {
  if (state.publishRateHz !== _lastPublishRate) {
    _lastPublishRate = state.publishRateHz;
    const newRate = state.publishRateHz;
    for (const [topic, interval] of _intervals.entries()) {
      clearInterval(interval);
      _intervals.set(
        topic,
        setInterval(() => {
          const fns = _publishFns.get(topic);
          if (fns && fns.size > 0) {
            fns.values().next().value!();
          }
        }, 1000 / newRate),
      );
    }
  }
});

function buildTwistFromAxes(axes: Record<string, number>): TwistMessage {
  const twist: TwistMessage = { linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } };
  for (const [field, value] of Object.entries(axes) as [TwistField, number][]) {
    const [group, axis] = field.split('.') as ['linear' | 'angular', 'x' | 'y' | 'z'];
    twist[group][axis] = value ?? 0;
  }
  return twist;
}

export function useCmdVelPublisher(
  topic: string,
  useTwistStamped: boolean,
  frameId: string,
): { publishNow: () => void } {
  const ros = useRosStore((s) => s.connection.ros);
  const transport = useRosStore((s) => s.transport);
  const status = useRosStore((s) => s.connection.status);
  const roslibTopicRef = useRef<any>(null);
  // Track which messageType the current roslibTopic was advertised with,
  // so we can guard against the render→effect race and config mismatches.
  const roslibTopicTypeRef = useRef<string | null>(null);

  useEffect(() => {
    // Unadvertise old topic before replacing — prevents rosbridge from keeping
    // the old type registration alive when useTwistStamped changes.
    roslibTopicRef.current?.unadvertise?.();
    roslibTopicRef.current = null;
    roslibTopicTypeRef.current = null;

    if (ros && status === 'connected') {
      const messageType = useTwistStamped
        ? 'geometry_msgs/msg/TwistStamped'
        : 'geometry_msgs/msg/Twist';
      roslibTopicRef.current = createCmdVelTopic(ros, topic, useTwistStamped);
      roslibTopicTypeRef.current = messageType;
    }

    return () => {
      roslibTopicRef.current?.unadvertise?.();
      roslibTopicRef.current = null;
      roslibTopicTypeRef.current = null;
    };
  }, [ros, status, topic, useTwistStamped]);

  // publishRef is updated every render so the interval always calls fresh logic.
  const publishRef = useRef<() => void>(() => {});
  publishRef.current = () => {
    const axes = useCmdVelStore.getState().topics[topic] ?? {};
    const twist = buildTwistFromAxes(axes);
    const msg = useTwistStamped ? buildTwistStampedMessage(twist, frameId) : twist;
    const messageType = useTwistStamped
      ? 'geometry_msgs/msg/TwistStamped'
      : 'geometry_msgs/msg/Twist';

    // Only publish via roslib Topic if its advertised type still matches the
    // current config — guards the render→effect race window.
    if (roslibTopicRef.current && roslibTopicTypeRef.current === messageType) {
      roslibTopicRef.current.publish(msg);
    } else if (transport && status === 'connected') {
      transport.publish(topic, messageType, msg);
    }
  };

  // Stable wrapper so we can remove it from the Set on unmount.
  const stableWrapperRef = useRef<() => void>(() => publishRef.current());

  useEffect(() => {
    const myFn = stableWrapperRef.current;

    if (!_publishFns.has(topic)) {
      _publishFns.set(topic, new Set());
    }
    _publishFns.get(topic)!.add(myFn);

    if (!_intervals.has(topic)) {
      _intervals.set(
        topic,
        setInterval(() => {
          const fns = _publishFns.get(topic);
          if (fns && fns.size > 0) {
            // Any fn works — they all read from the same store.
            fns.values().next().value!();
          }
        }, 1000 / useSettingsStore.getState().publishRateHz),
      );
    }

    return () => {
      _publishFns.get(topic)?.delete(myFn);
      if (_publishFns.get(topic)?.size === 0) {
        clearInterval(_intervals.get(topic));
        _intervals.delete(topic);
        _publishFns.delete(topic);
      }
    };
  }, [topic]);

  return { publishNow: () => publishRef.current() };
}
