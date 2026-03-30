import { useEffect, useRef, useState } from 'react';

// Module-level registry so sibling joystick instances can find each other's
// gesture refs and declare simultaneous recognition.
const _gestureRefs = new Map<string, React.RefObject<any>>();
const _subscribers = new Set<() => void>();

function notifyAll() {
  _subscribers.forEach((fn) => fn());
}

export function useJoystickMultitouch() {
  // Stable ID for this instance — generated once on mount.
  const id = useRef(Math.random().toString(36).slice(2)).current;
  const gestureRef = useRef(null);
  // Re-render trigger so this joystick rebuilds its gesture when peers change.
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    _gestureRefs.set(id, gestureRef);
    const sub = () => forceUpdate((n) => n + 1);
    _subscribers.add(sub);
    notifyAll();

    return () => {
      _gestureRefs.delete(id);
      _subscribers.delete(sub);
      notifyAll();
    };
  }, []);

  const simultaneousRefs = [..._gestureRefs.entries()]
    .filter(([k]) => k !== id)
    .map(([, v]) => v);

  return { gestureRef, simultaneousRefs, debugId: id };
}
