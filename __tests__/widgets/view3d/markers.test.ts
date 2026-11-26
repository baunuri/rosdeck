import { MARKER, MarkerStore } from '../../../widgets/view3d/markers';

const identity = (xyz: Float32Array) => xyz;
const red = { r: 1, g: 0, b: 0, a: 1 };

describe('MarkerStore', () => {
  it('adds, replaces by ns/id, deletes and deletes all', () => {
    const store = new MarkerStore();
    store.apply({ ns: 'a', id: 1, type: MARKER.CUBE });
    store.apply({ ns: 'a', id: 1, type: MARKER.SPHERE }); // same key: replace
    store.apply({ ns: 'b', id: 1, type: MARKER.CUBE });
    expect(store.size).toBe(2);
    store.apply({ ns: 'a', id: 1, action: 2 });
    expect(store.size).toBe(1);
    store.apply({ action: 3 });
    expect(store.size).toBe(0);
  });

  it('DELETEALL with a namespace only clears that namespace', () => {
    const store = new MarkerStore();
    store.apply({ ns: 'a', id: 1 }); store.apply({ ns: 'b', id: 1 });
    store.apply({ ns: 'a', action: 3 });
    expect(store.size).toBe(1);
  });

  it('expires markers after their lifetime', () => {
    const store = new MarkerStore();
    store.apply({ id: 1, lifetime: { sec: 1, nanosec: 0 } }, 1000);
    store.apply({ id: 2 }, 1000);
    expect(store.prune(1500)).toBe(false);
    expect(store.prune(2001)).toBe(true);
    expect(store.size).toBe(1);
  });

  it('builds a cube as 12 shaded triangles at its pose', () => {
    const store = new MarkerStore();
    store.apply({ id: 1, type: MARKER.CUBE, scale: { x: 2, y: 2, z: 2 }, color: red,
      pose: { position: { x: 10, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } });
    const { triangles } = store.build(identity);
    expect(triangles.xyz.length).toBe(12 * 3 * 3);
    const xs = Array.from(triangles.xyz).filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs)).toBeCloseTo(9);
    expect(Math.max(...xs)).toBeCloseTo(11);
    expect(triangles.rgba[0]).toBeGreaterThan(0.5); // red, shaded
    expect(triangles.rgba[1]).toBe(0);
  });

  it('line strips become line segments with per-point colours', () => {
    const store = new MarkerStore();
    store.apply({ id: 1, type: MARKER.LINE_STRIP, color: red,
      points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }] });
    const { lines } = store.build(identity);
    expect(lines.xyz.length).toBe(4 * 3); // two segments
  });

  it('rotates by the marker orientation and skips markers TF cannot place', () => {
    const store = new MarkerStore();
    const yaw90 = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };
    store.apply({ ns: 'ok', id: 1, type: MARKER.POINTS, header: { frame_id: 'map' },
      pose: { position: { x: 0, y: 0, z: 0 }, orientation: yaw90 }, points: [{ x: 1, y: 0, z: 0 }] });
    store.apply({ ns: 'lost', id: 1, type: MARKER.POINTS, header: { frame_id: 'nowhere' }, points: [{ x: 1, y: 0, z: 0 }] });
    const { points } = store.build((xyz, frame) => (frame === 'map' ? xyz : null));
    expect(Array.from(points.xyz).map((v) => +v.toFixed(5) + 0)).toEqual([0, 1, 0]);
  });
});

describe('MarkerStore level of detail', () => {
  it('draws solids as single points once there are more than the budget', () => {
    const store = new MarkerStore();
    for (let i = 0; i < 5; i++) {
      store.apply({ id: i, type: MARKER.SPHERE, pose: { position: { x: i, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } });
    }
    const meshed = store.build((xyz) => xyz, 10);
    expect(meshed.triangles.xyz.length).toBeGreaterThan(0);
    expect(meshed.points.xyz.length).toBe(0);
    const asPoints = store.build((xyz) => xyz, 4);
    expect(asPoints.triangles.xyz.length).toBe(0);
    expect(Array.from(asPoints.points.xyz).filter((_, i) => i % 3 === 0)).toEqual([0, 1, 2, 3, 4]);
  });
});
