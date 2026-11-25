/**
 * visualization_msgs/Marker(Array) support for the 3D View: keeps the live marker set
 * (keyed by ns/id, honouring DELETE, DELETEALL and lifetime) and builds per-vertex
 * coloured geometry for the renderer's marker layers.
 *
 * ponytail: TEXT_VIEW_FACING (9) and MESH_RESOURCE (10) are skipped (need a font renderer /
 * mesh loading over the bridge); add when someone needs them.
 */
import { arrow } from './geometry';

type Vec3 = { x: number; y: number; z: number };
type Quat = { x: number; y: number; z: number; w: number };
type Color = { r: number; g: number; b: number; a: number };

export interface MarkerMsg {
  header?: { frame_id?: string };
  ns?: string;
  id?: number;
  type?: number;
  action?: number;
  pose?: { position?: Vec3; orientation?: Quat };
  scale?: Vec3;
  color?: Color;
  lifetime?: { sec?: number; nanosec?: number };
  points?: Vec3[];
  colors?: Color[];
}

export const MARKER = {
  ARROW: 0, CUBE: 1, SPHERE: 2, CYLINDER: 3, LINE_STRIP: 4, LINE_LIST: 5,
  CUBE_LIST: 6, SPHERE_LIST: 7, POINTS: 8, TEXT_VIEW_FACING: 9, MESH_RESOURCE: 10, TRIANGLE_LIST: 11,
} as const;
const ADD = 0, DELETE = 2, DELETEALL = 3;
const SOLIDS = new Set<number>([MARKER.CUBE, MARKER.SPHERE, MARKER.CYLINDER]);
/**
 * Above this many solids (cubes/spheres/cylinders, counting cube-list entries) each is drawn
 * as one point instead of a mesh. Planners publish thousands of sample spheres (e.g. 7.6k
 * per message at 14 Hz); meshing those is millions of vertices per frame.
 */
export const SOLID_BUDGET = 300;

export interface MarkerGeometry { xyz: Float32Array; rgba: Float32Array }
export interface MarkerBuild { triangles: MarkerGeometry; lines: MarkerGeometry; points: MarkerGeometry }
/** Transforms flat xyz (in place or copy) from `frame` into the fixed frame; null if TF can't. */
export type FrameTransform = (xyz: Float32Array, frame: string) => Float32Array | null;

class Builder {
  xyz: number[] = [];
  rgba: number[] = [];
  push(p: number[], c: number[]) { this.xyz.push(p[0], p[1], p[2]); this.rgba.push(c[0], c[1], c[2], c[3]); }
}

const rgbaOf = (c?: Color) => [c?.r ?? 1, c?.g ?? 1, c?.b ?? 1, c?.a ?? 1];
const shade = (c: number[], k: number) => [c[0] * k, c[1] * k, c[2] * k, c[3]];

function rotate(q: Quat, v: number[]): number[] {
  // v' = v + 2w(q×v) + 2 q×(q×v)
  const { x, y, z, w } = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

/** Triangles of a unit solid centred on the origin, scaled to `s` (each triangle shaded by its normal). */
function solid(type: number, s: Vec3): number[][][] {
  const tris: number[][][] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => { tris.push([a, b, c], [a, c, d]); };
  if (type === MARKER.CUBE) {
    const [hx, hy, hz] = [s.x / 2, s.y / 2, s.z / 2];
    const v = (i: number, j: number, k: number) => [i * hx, j * hy, k * hz];
    quad(v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1)); quad(v(-1, -1, -1), v(-1, 1, -1), v(1, 1, -1), v(1, -1, -1));
    quad(v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1)); quad(v(-1, 1, -1), v(-1, 1, 1), v(1, 1, 1), v(1, 1, -1));
    quad(v(1, -1, -1), v(1, 1, -1), v(1, 1, 1), v(1, -1, 1)); quad(v(-1, -1, -1), v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1));
  } else {
    // Sphere: latitude bands; cylinder: two bands with flat caps. 12 segments each.
    const seg = 12;
    const ring = (lat: number, r: number, z: number) => Array.from({ length: seg + 1 }, (_, i) => {
      const a = (i / seg) * Math.PI * 2;
      return [Math.cos(a) * r * s.x / 2, Math.sin(a) * r * s.y / 2, z * s.z / 2];
    });
    const rings = type === MARKER.SPHERE
      ? Array.from({ length: 7 }, (_, k) => { const lat = -Math.PI / 2 + (k / 6) * Math.PI; return ring(lat, Math.cos(lat), Math.sin(lat)); })
      : [ring(0, 1, -1), ring(0, 1, 1)];
    for (let k = 0; k + 1 < rings.length; k++) {
      for (let i = 0; i < seg; i++) quad(rings[k][i], rings[k][i + 1], rings[k + 1][i + 1], rings[k + 1][i]);
    }
    if (type === MARKER.CYLINDER) {
      for (let i = 0; i < seg; i++) {
        tris.push([[0, 0, s.z / 2], rings[1][i], rings[1][i + 1]], [[0, 0, -s.z / 2], rings[0][i + 1], rings[0][i]]);
      }
    }
  }
  return tris;
}

function normalShade(t: number[][]): number {
  const u = [t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]];
  const v = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  return 0.55 + 0.45 * Math.abs(n[2] / len); // light from above
}

export class MarkerStore {
  private markers = new Map<string, { msg: MarkerMsg; expires: number }>();
  /** Bumped on every change, so the view knows when to rebuild. */
  version = 0;

  apply(msg: MarkerMsg, now = Date.now()) {
    const action = msg.action ?? ADD;
    const key = `${msg.ns ?? ''}/${msg.id ?? 0}`;
    if (action === DELETEALL) {
      if (msg.ns) for (const k of [...this.markers.keys()]) { if (k.startsWith(`${msg.ns}/`)) this.markers.delete(k); }
      else this.markers.clear();
    } else if (action === DELETE) {
      this.markers.delete(key);
    } else {
      const life = (msg.lifetime?.sec ?? 0) + (msg.lifetime?.nanosec ?? 0) / 1e9;
      this.markers.set(key, { msg, expires: life > 0 ? now + life * 1000 : Infinity });
    }
    this.version++;
  }

  /** Drops expired markers; true when anything was removed. */
  prune(now = Date.now()): boolean {
    let removed = false;
    for (const [k, m] of this.markers) if (m.expires <= now) { this.markers.delete(k); removed = true; }
    if (removed) this.version++;
    return removed;
  }

  get size() { return this.markers.size; }

  build(toFixed: FrameTransform, solidBudget = SOLID_BUDGET): MarkerBuild {
    // Posed geometry is collected per (frame, target) and transformed once per frame: thousands
    // of markers usually share one frame, and each TF lookup is a graph search.
    const groups = new Map<string, { frame: string; target: Builder; local: Builder }>();
    const tris = new Builder(), lines = new Builder(), points = new Builder();
    let solids = 0;
    for (const { msg } of this.markers.values()) {
      if (SOLIDS.has(msg.type ?? 0)) solids++;
      else if (msg.type === MARKER.CUBE_LIST) solids += msg.points?.length ?? 0;
    }
    const solidsAsPoints = solids > solidBudget;
    for (const { msg } of this.markers.values()) {
      let t = msg.type ?? 0;
      if (t === MARKER.TEXT_VIEW_FACING || t === MARKER.MESH_RESOURCE) continue;
      if (solidsAsPoints && SOLIDS.has(t)) {
        // Fast path (thousands of these): one point at the pose, no per-marker builder.
        const frame = msg.header?.frame_id ?? '';
        const key = `${frame}|p`;
        let group = groups.get(key);
        if (!group) groups.set(key, (group = { frame, target: points, local: new Builder() }));
        const pos = msg.pose?.position;
        const c = msg.color;
        group.local.xyz.push(pos?.x ?? 0, pos?.y ?? 0, pos?.z ?? 0);
        group.local.rgba.push(c?.r ?? 1, c?.g ?? 1, c?.b ?? 1, c?.a ?? 1);
        continue;
      }
      if (solidsAsPoints && t === MARKER.CUBE_LIST) t = MARKER.POINTS; // one point per entry
      const q = msg.pose?.orientation ?? { x: 0, y: 0, z: 0, w: 1 };
      const p = msg.pose?.position ?? { x: 0, y: 0, z: 0 };
      const s = msg.scale ?? { x: 1, y: 1, z: 1 };
      const base = rgbaOf(msg.color);
      const pts = msg.points ?? [];
      const colorAt = (i: number) => (msg.colors && msg.colors.length === pts.length ? rgbaOf(msg.colors[i]) : base);
      // Local geometry, then pose, then frame -> fixed (one TF lookup per marker).
      const local = new Builder();
      let target = lines;
      if (t === MARKER.ARROW) {
        target = tris;
        let a: Float32Array;
        if (pts.length >= 2) {
          const [p0, p1] = pts;
          const len = Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
          a = arrow(p0.x, p0.y, p0.z, Math.atan2(p1.y - p0.y, p1.x - p0.x), len, Math.max(s.y, s.x * 2));
        } else {
          a = arrow(0, 0, 0, 0, s.x, Math.max(s.y, s.z));
        }
        for (let i = 0; i < a.length; i += 3) local.push([a[i], a[i + 1], a[i + 2]], base);
      } else if (t === MARKER.CUBE || t === MARKER.SPHERE || t === MARKER.CYLINDER) {
        target = tris;
        for (const tri of solid(t, s)) { const c = shade(base, normalShade(tri)); for (const v of tri) local.push(v, c); }
      } else if (t === MARKER.CUBE_LIST) {
        target = tris;
        const cube = solid(MARKER.CUBE, s);
        pts.forEach((pt, i) => { for (const tri of cube) { const c = shade(colorAt(i), normalShade(tri)); for (const v of tri) local.push([v[0] + pt.x, v[1] + pt.y, v[2] + pt.z], c); } });
      } else if (t === MARKER.LINE_STRIP) {
        for (let i = 0; i + 1 < pts.length; i++) {
          local.push([pts[i].x, pts[i].y, pts[i].z], colorAt(i));
          local.push([pts[i + 1].x, pts[i + 1].y, pts[i + 1].z], colorAt(i + 1));
        }
      } else if (t === MARKER.LINE_LIST) {
        for (let i = 0; i + 1 < pts.length; i += 2) {
          local.push([pts[i].x, pts[i].y, pts[i].z], colorAt(i));
          local.push([pts[i + 1].x, pts[i + 1].y, pts[i + 1].z], colorAt(i + 1));
        }
      } else if (t === MARKER.POINTS || t === MARKER.SPHERE_LIST) {
        target = points;
        pts.forEach((pt, i) => local.push([pt.x, pt.y, pt.z], colorAt(i)));
      } else if (t === MARKER.TRIANGLE_LIST) {
        target = tris;
        for (let i = 0; i + 2 < pts.length; i += 3) {
          const tri = [pts[i], pts[i + 1], pts[i + 2]].map((v) => [v.x, v.y, v.z]);
          const k = normalShade(tri);
          tri.forEach((v, j) => local.push(v, shade(colorAt(i + j), k)));
        }
      } else {
        continue;
      }
      if (local.xyz.length === 0) continue;
      const frame = msg.header?.frame_id ?? '';
      const key = `${frame}|${target === tris ? 't' : target === lines ? 'l' : 'p'}`;
      let group = groups.get(key);
      if (!group) groups.set(key, (group = { frame, target, local: new Builder() }));
      const identity = q.x === 0 && q.y === 0 && q.z === 0;
      for (let i = 0; i < local.xyz.length; i += 3) {
        const v = [local.xyz[i], local.xyz[i + 1], local.xyz[i + 2]];
        const r = identity ? v : rotate(q, v);
        group.local.xyz.push(r[0] + p.x, r[1] + p.y, r[2] + p.z);
      }
      for (let i = 0; i < local.rgba.length; i++) group.local.rgba.push(local.rgba[i]);
    }
    for (const { frame, target, local } of groups.values()) {
      const fixed = toFixed(Float32Array.from(local.xyz), frame);
      if (!fixed) continue;
      for (let i = 0; i < fixed.length; i++) target.xyz.push(fixed[i]);
      for (let i = 0; i < local.rgba.length; i++) target.rgba.push(local.rgba[i]);
    }
    const out = (b: Builder) => ({ xyz: Float32Array.from(b.xyz), rgba: Float32Array.from(b.rgba) });
    return { triangles: out(tris), lines: out(lines), points: out(points) };
  }
}
