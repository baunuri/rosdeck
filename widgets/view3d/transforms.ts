// Ported from the lifliu/rosdeck fork (GPL-3.0), generalized for any robot.

export interface PointCloudPoint {
  x: number;
  y: number;
  z: number;
  intensity: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

interface RigidTransform {
  translation: Point3D;
  rotation: Quaternion;
}

function multiplyQuaternion(a: Quaternion, b: Quaternion): Quaternion {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

function conjugate(q: Quaternion): Quaternion {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

function rotate(point: Point3D, q: Quaternion): Point3D {
  const value = multiplyQuaternion(
    multiplyQuaternion(q, { ...point, w: 0 }),
    conjugate(q),
  );
  return { x: value.x, y: value.y, z: value.z };
}

function compose(first: RigidTransform, second: RigidTransform): RigidTransform {
  const translated = rotate(second.translation, first.rotation);
  return {
    translation: {
      x: first.translation.x + translated.x,
      y: first.translation.y + translated.y,
      z: first.translation.z + translated.z,
    },
    rotation: multiplyQuaternion(first.rotation, second.rotation),
  };
}

function inverse(transform: RigidTransform): RigidTransform {
  const rotation = conjugate(transform.rotation);
  const translation = rotate({
    x: -transform.translation.x,
    y: -transform.translation.y,
    z: -transform.translation.z,
  }, rotation);
  return { translation, rotation };
}

const IDENTITY_TRANSFORM: RigidTransform = {
  translation: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
};

const stripSlash = (frame: string) => frame.replace(/^\//, '');

/** Bidirectional 3D TF graph (latest transform per edge, no time history). */
export class TfPositionTracker {
  private edges = new Map<string, Map<string, RigidTransform>>();

  clear(): void {
    this.edges.clear();
  }

  update(message: any): void {
    for (const item of message?.transforms ?? []) {
      const parent = stripSlash(String(item?.header?.frame_id ?? ''));
      const child = stripSlash(String(item?.child_frame_id ?? ''));
      if (!parent || !child) continue;
      const value: RigidTransform = {
        translation: {
          x: Number(item?.transform?.translation?.x ?? 0),
          y: Number(item?.transform?.translation?.y ?? 0),
          z: Number(item?.transform?.translation?.z ?? 0),
        },
        rotation: {
          x: Number(item?.transform?.rotation?.x ?? 0),
          y: Number(item?.transform?.rotation?.y ?? 0),
          z: Number(item?.transform?.rotation?.z ?? 0),
          w: Number(item?.transform?.rotation?.w ?? 1),
        },
      };
      this.setEdge(parent, child, value);
      this.setEdge(child, parent, inverse(value));
    }
  }

  /** Returns `fromFrame_T_toFrame` (toFrame expressed in fromFrame), like a ROS TF lookup. */
  private lookupTransform(fromFrame: string, toFrame: string): RigidTransform | null {
    const from = stripSlash(fromFrame);
    const to = stripSlash(toFrame);
    if (!from || !to) return null;
    const queue: Array<{ frame: string; transform: RigidTransform }> = [
      { frame: from, transform: IDENTITY_TRANSFORM },
    ];
    const visited = new Set([from]);
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.frame === to) return current.transform;
      for (const [next, edge] of this.edges.get(current.frame) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push({ frame: next, transform: compose(current.transform, edge) });
      }
    }
    return null;
  }

  /** `fromFrame_T_toFrame` as translation + rotation (e.g. the robot's pose in the fixed frame). */
  lookupPose(fromFrame: string, toFrame: string): { translation: Point3D; rotation: Quaternion } | null {
    return this.lookupTransform(fromFrame, toFrame);
  }

  lookupPosition(fromFrame: string, toFrame: string): Point3D | null {
    return this.lookupTransform(fromFrame, toFrame)?.translation ?? null;
  }

  /** Transforms points from sourceFrame into targetFrame; null until TF connects them. */
  transformPointCloud(
    points: PointCloudPoint[],
    sourceFrame: string,
    targetFrame: string,
  ): PointCloudPoint[] | null {
    const source = stripSlash(sourceFrame);
    const target = stripSlash(targetFrame);
    if (!source || !target) return null;
    if (source === target) return points;

    const transform = this.lookupTransform(target, source);
    if (!transform) return null;
    return points.map((point) => {
      const rotated = rotate(point, transform.rotation);
      return {
        x: rotated.x + transform.translation.x,
        y: rotated.y + transform.translation.y,
        z: rotated.z + transform.translation.z,
        intensity: point.intensity,
      };
    });
  }

  /** Flat [x,y,z,...] variant of transformPointCloud; transforms in place. */
  transformFlat(xyz: Float32Array, sourceFrame: string, targetFrame: string): Float32Array | null {
    const source = stripSlash(sourceFrame);
    const target = stripSlash(targetFrame);
    if (!source || !target) return null;
    if (source === target) return xyz;
    const transform = this.lookupTransform(target, source);
    if (!transform) return null;
    // Quaternion → rotation matrix once, instead of two quaternion products per point.
    const { x: qx, y: qy, z: qz, w: qw } = transform.rotation;
    const { x: tx, y: ty, z: tz } = transform.translation;
    const r00 = 1 - 2 * (qy * qy + qz * qz), r01 = 2 * (qx * qy - qz * qw), r02 = 2 * (qx * qz + qy * qw);
    const r10 = 2 * (qx * qy + qz * qw), r11 = 1 - 2 * (qx * qx + qz * qz), r12 = 2 * (qy * qz - qx * qw);
    const r20 = 2 * (qx * qz - qy * qw), r21 = 2 * (qy * qz + qx * qw), r22 = 1 - 2 * (qx * qx + qy * qy);
    for (let i = 0; i < xyz.length; i += 3) {
      const x = xyz[i], y = xyz[i + 1], z = xyz[i + 2];
      xyz[i] = r00 * x + r01 * y + r02 * z + tx;
      xyz[i + 1] = r10 * x + r11 * y + r12 * z + ty;
      xyz[i + 2] = r20 * x + r21 * y + r22 * z + tz;
    }
    return xyz;
  }

  private setEdge(from: string, to: string, transform: RigidTransform): void {
    if (!this.edges.has(from)) this.edges.set(from, new Map());
    this.edges.get(from)!.set(to, transform);
  }
}

interface PointFieldLike {
  name: string;
  offset: number;
  datatype: number;
}

function asBytes(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (Array.isArray(data)) return Uint8Array.from(data);
  if (typeof data === 'string') {
    try {
      // rosbridge JSON encodes uint8[] as base64; Foxglove/CDR delivers Uint8Array.
      return Uint8Array.from(atob(data), (character) => character.charCodeAt(0));
    } catch {
      return null;
    }
  }
  return null;
}

/** Validated byte layout of a PointCloud2 with FLOAT32 x/y/z, decimated to ≤ maxPoints. */
function cloudLayout(message: any, maxPoints: number) {
  const bytes = asBytes(message?.data);
  const pointStep = Number(message?.point_step ?? 0);
  const fields = Array.isArray(message?.fields) ? message.fields as PointFieldLike[] : [];
  if (!bytes || pointStep <= 0 || fields.length === 0) return null;

  const byName = new Map(fields.map((field) => [field.name, field]));
  const x = byName.get('x');
  const y = byName.get('y');
  const z = byName.get('z');
  // sensor_msgs/PointField.FLOAT32 = 7
  if (!x || !y || !z || [x, y, z].some((f) => f.datatype !== 7)) return null;
  const intensity = byName.get('intensity');

  const fitting = Math.floor(bytes.byteLength / pointStep);
  const declared = Number(message?.width ?? 0) * Math.max(1, Number(message?.height ?? 1));
  const count = Math.min(declared || fitting, fitting);
  return {
    view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    littleEndian: !message?.is_bigendian,
    pointStep,
    count,
    // Uniform stride while parsing: a 300k-point cloud never costs 300k reads.
    step: Math.max(1, Math.ceil(count / maxPoints)),
    ox: Number(x.offset),
    oy: Number(y.offset),
    oz: Number(z.offset),
    oi: intensity?.datatype === 7 ? Number(intensity.offset) : -1,
  };
}

/** Parses FLOAT32 x/y/z (+ optional FLOAT32 intensity) into point objects. */
export function parsePointCloud2(message: any, maxPoints = Infinity): PointCloudPoint[] {
  const L = cloudLayout(message, maxPoints);
  if (!L) return [];
  const points: PointCloudPoint[] = [];
  for (let index = 0; index < L.count; index += L.step) {
    const base = index * L.pointStep;
    const x = L.view.getFloat32(base + L.ox, L.littleEndian);
    const y = L.view.getFloat32(base + L.oy, L.littleEndian);
    const z = L.view.getFloat32(base + L.oz, L.littleEndian);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    const intensity = L.oi >= 0 ? L.view.getFloat32(base + L.oi, L.littleEndian) : 0;
    points.push({ x, y, z, intensity: Number.isFinite(intensity) ? intensity : 0 });
  }
  return points;
}

/** Parses FLOAT32 x/y/z straight into a flat [x,y,z,...] Float32Array (no per-point objects). */
export function parsePointCloud2Flat(message: any, maxPoints = Infinity): Float32Array {
  const L = cloudLayout(message, maxPoints);
  if (!L) return new Float32Array(0);
  const out = new Float32Array(Math.ceil(L.count / L.step) * 3);
  let n = 0;
  for (let index = 0; index < L.count; index += L.step) {
    const base = index * L.pointStep;
    const x = L.view.getFloat32(base + L.ox, L.littleEndian);
    const y = L.view.getFloat32(base + L.oy, L.littleEndian);
    const z = L.view.getFloat32(base + L.oz, L.littleEndian);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    out[n++] = x; out[n++] = y; out[n++] = z;
  }
  return out.slice(0, n);
}

function voxelKey(point: PointCloudPoint, size: number): string {
  return `${Math.floor(point.x / size)},${Math.floor(point.y / size)},${Math.floor(point.z / size)}`;
}

/** Keeps a bounded, global preview by increasing voxel size as the map grows. */
export class AdaptiveVoxelAccumulator {
  private voxels = new Map<string, PointCloudPoint>();
  private size: number;

  constructor(
    private readonly initialVoxelSize = 0.12,
    private readonly maxPoints = 60000,
  ) {
    this.size = initialVoxelSize;
  }

  clear(): void {
    this.voxels.clear();
    this.size = this.initialVoxelSize;
  }

  add(points: PointCloudPoint[]): void {
    for (const point of points) this.voxels.set(voxelKey(point, this.size), point);
    while (this.voxels.size > this.maxPoints) {
      this.size *= 1.25;
      const rebuilt = new Map<string, PointCloudPoint>();
      for (const point of this.voxels.values()) rebuilt.set(voxelKey(point, this.size), point);
      this.voxels = rebuilt;
    }
  }

  get voxelSize(): number {
    return this.size;
  }

  get pointCount(): number {
    return this.voxels.size;
  }

  snapshot(maxPoints = 18000): PointCloudPoint[] {
    const values = [...this.voxels.values()];
    if (values.length <= maxPoints) return values;
    const stride = values.length / maxPoints;
    return Array.from({ length: maxPoints }, (_, index) => values[Math.floor(index * stride)]);
  }
}
