/**
 * A single-view touch dispatcher for multi-touch widgets.
 *
 * Problem: GestureHandlerRootView intercepts ALL touches in the hierarchy and
 * cancels multi-touch on sibling views. Even raw onTouchStart/onTouchMove on
 * plain Views gets a synthetic onTouchEnd(changedTouches=0) cancel from RNGH
 * when a second finger lands on a different sibling view.
 *
 * Solution: one View at the LayoutRenderer level receives ALL touches. This
 * module routes each touch to the registered widget whose bounds contain it.
 */

export interface DispatchEntry {
  bounds: { x: number; y: number; width: number; height: number } | null;
  onTouchStart: (touchId: number, pageX: number, pageY: number) => void;
  onTouchMove: (touchId: number, dx: number, dy: number) => void;
  onTouchEnd: (touchId: number) => void;
}

// keyed by widget instance id
const _entries = new Map<string, DispatchEntry>();
// touchIdentifier → { entryId, startX, startY }
const _active = new Map<number, { id: string; startX: number; startY: number }>();

export function registerTouchEntry(id: string, entry: DispatchEntry) {
  _entries.set(id, entry);
}

export function unregisterTouchEntry(id: string) {
  _entries.delete(id);
}

export function updateTouchBounds(id: string, bounds: DispatchEntry['bounds']) {
  const entry = _entries.get(id);
  if (entry) entry.bounds = bounds;
}

function findEntryAt(pageX: number, pageY: number): DispatchEntry | null {
  for (const entry of _entries.values()) {
    if (!entry.bounds) continue;
    const { x, y, width, height } = entry.bounds;
    if (pageX >= x && pageX < x + width && pageY >= y && pageY < y + height) {
      return entry;
    }
  }
  return null;
}

export function dispatchTouchStart(changedTouches: any[]) {
  for (const touch of changedTouches) {
    if (_active.has(touch.identifier)) continue; // already tracked
    const entry = findEntryAt(touch.pageX, touch.pageY);
    if (!entry) continue;
    _active.set(touch.identifier, {
      id: [..._entries.entries()].find(([, v]) => v === entry)?.[0] ?? '',
      startX: touch.pageX,
      startY: touch.pageY,
    });
    entry.onTouchStart(touch.identifier, touch.pageX, touch.pageY);
  }
}

export function dispatchTouchMove(changedTouches: any[]) {
  for (const touch of changedTouches) {
    const active = _active.get(touch.identifier);
    if (!active) continue;
    const entry = _entries.get(active.id);
    if (!entry) continue;
    entry.onTouchMove(touch.identifier, touch.pageX - active.startX, touch.pageY - active.startY);
  }
}

export function dispatchTouchEnd(changedTouches: any[]) {
  for (const touch of changedTouches) {
    const active = _active.get(touch.identifier);
    if (!active) continue;
    const entry = _entries.get(active.id);
    entry?.onTouchEnd(touch.identifier);
    _active.delete(touch.identifier);
  }
}
