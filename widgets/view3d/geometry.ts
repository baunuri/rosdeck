/** Pure scene-geometry builders for the 3D View (all return flat [x,y,z,...] arrays). */

export interface Quaternion { x: number; y: number; z: number; w: number }

export function yawOf(q: Quaternion): number {
  return Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
}

/** Square grid of lines in the z = 0 plane, `halfExtent` metres each way from the origin. */
export function gridLines(halfExtent = 50, step = 1): Float32Array {
  const n = Math.floor(halfExtent / step);
  const out: number[] = [];
  for (let i = -n; i <= n; i++) {
    const v = i * step;
    out.push(v, -n * step, 0, v, n * step, 0); // parallel to y
    out.push(-n * step, v, 0, n * step, v, 0); // parallel to x
  }
  return Float32Array.from(out);
}

/** Filled arrow (two triangles: head + shaft) pointing along `yaw`, tail at (x, y). */
export function arrow(x: number, y: number, z: number, yaw: number, length = 0.6, width = 0.36): Float32Array {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (f: number, l: number) => [x + c * f - s * l, y + s * f + c * l, z];
  const head = length * 0.45;
  const shaft = width * 0.3;
  return Float32Array.from([
    // head
    ...at(length, 0), ...at(length - head, width / 2), ...at(length - head, -width / 2),
    // shaft (two triangles)
    ...at(0, shaft / 2), ...at(length - head, shaft / 2), ...at(0, -shaft / 2),
    ...at(0, -shaft / 2), ...at(length - head, shaft / 2), ...at(length - head, -shaft / 2),
  ]);
}

export interface GridInfo {
  width: number;
  height: number;
  resolution: number;
  origin: { position: { x: number; y: number; z: number }; orientation: Quaternion };
}

/**
 * Corners of an OccupancyGrid in its own frame, in the order the renderer's quad
 * expects: origin cell, +x edge, +y edge, far corner. Honours the origin's yaw.
 * `zOffset` lifts layers apart (costmaps above the map) without a depth buffer.
 */
export function gridCorners(info: GridInfo, zOffset = 0): Float32Array {
  const { x, y, z } = info.origin.position;
  const yaw = yawOf(info.origin.orientation);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const w = info.width * info.resolution;
  const h = info.height * info.resolution;
  const at = (u: number, v: number) => [x + c * u - s * v, y + s * u + c * v, z + zOffset];
  return Float32Array.from([...at(0, 0), ...at(w, 0), ...at(0, h), ...at(w, h)]);
}

export interface LaserScanLike {
  angle_min: number;
  angle_increment: number;
  range_min: number;
  range_max: number;
  ranges: ArrayLike<number>;
}

/** Valid returns of a LaserScan as points in the scan's own frame. */
export function laserScanToXyz(scan: LaserScanLike): Float32Array {
  const out = new Float32Array(scan.ranges.length * 3);
  let n = 0;
  for (let i = 0; i < scan.ranges.length; i++) {
    const r = scan.ranges[i];
    if (!(r >= scan.range_min && r <= scan.range_max)) continue; // also drops NaN / Inf
    const a = scan.angle_min + i * scan.angle_increment;
    out[n++] = r * Math.cos(a);
    out[n++] = r * Math.sin(a);
    out[n++] = 0;
  }
  return out.slice(0, n);
}

/** nav_msgs/Path poses as a polyline in the path's frame. */
export function pathToXyz(path: { poses?: Array<{ pose?: { position?: { x: number; y: number; z: number } } }> }): Float32Array {
  const poses = path.poses ?? [];
  const out = new Float32Array(poses.length * 3);
  poses.forEach((p, i) => {
    out[3 * i] = p.pose?.position?.x ?? 0;
    out[3 * i + 1] = p.pose?.position?.y ?? 0;
    out[3 * i + 2] = p.pose?.position?.z ?? 0;
  });
  return out;
}
