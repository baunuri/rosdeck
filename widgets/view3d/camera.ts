/**
 * Orbit camera like RViz's Orbit (perspective) and TopDownOrtho (orthographic) views.
 *
 * In view coordinates relative to `target` (all in the fixed frame, metres):
 *   right = cos(yaw)·dx − sin(yaw)·dy
 *   fwd   = sin(yaw)·dx + cos(yaw)·dy
 *   up    = cos(pitch)·fwd + sin(pitch)·dz      (pitch 0 = top-down, x right / y up)
 * `viewMeters` is how many metres the shorter screen edge spans at the target.
 * Perspective places the eye on the axis pointing back at the viewer (w below), at the
 * distance where the target plane spans exactly `viewMeters`, so zoom and pan feel the same.
 */
export interface Camera {
  yaw: number;
  pitch: number;
  viewMeters: number;
  target: { x: number; y: number; z: number };
  perspective?: boolean;
}

const FOV = (60 * Math.PI) / 180; // across the shorter screen edge
const NEAR = 0.05;
const FAR = 2000;

/** Camera basis in the fixed frame: right, up (on screen) and w (back towards the viewer). */
function basis(c: Camera) {
  const cy = Math.cos(c.yaw), syaw = Math.sin(c.yaw);
  const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  const right = [cy, -syaw, 0];
  const up = [cp * syaw, cp * cy, sp];
  const w = [-sp * syaw, -sp * cy, cp];
  const distance = c.viewMeters / 2 / Math.tan(FOV / 2);
  const eye = [c.target.x + w[0] * distance, c.target.y + w[1] * distance, c.target.z + w[2] * distance];
  return { right, up, w, eye };
}

/** Focal scale per axis so the shorter edge spans FOV. */
function focal(width: number, height: number) {
  const f = 1 / Math.tan(FOV / 2);
  return width < height ? { fx: f, fy: (f * width) / height } : { fx: (f * height) / width, fy: f };
}

function scales(viewMeters: number, width: number, height: number) {
  const pixelsPerMeter = Math.min(width, height) / Math.max(1e-6, viewMeters);
  return { sx: (2 * pixelsPerMeter) / width, sy: (2 * pixelsPerMeter) / height };
}

/** Column-major 4×4 matrix taking fixed-frame points to clip space. */
export function viewProjection(c: Camera, width: number, height: number): Float32Array {
  if (c.perspective) {
    const { right, up, w, eye } = basis(c);
    const { fx, fy } = focal(width, height);
    const dot = (a: number[]) => a[0] * eye[0] + a[1] * eye[1] + a[2] * eye[2];
    // view = [right; up; w]·(p − eye); clip = P·view with the standard GL perspective P.
    const a = (FAR + NEAR) / (NEAR - FAR);
    const b = (2 * FAR * NEAR) / (NEAR - FAR);
    // prettier-ignore
    return new Float32Array([
      fx * right[0], fy * up[0], a * w[0], -w[0],
      fx * right[1], fy * up[1], a * w[1], -w[1],
      fx * right[2], fy * up[2], a * w[2], -w[2],
      -fx * dot(right), -fy * dot(up), -a * dot(w) + b, dot(w),
    ]);
  }
  const { sx, sy } = scales(c.viewMeters, width, height);
  const cy = Math.cos(c.yaw), syaw = Math.sin(c.yaw);
  const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  // Rows of the linear part (clip = R·(p − target)).
  const r0 = [sx * cy, -sx * syaw, 0];
  const r1 = [sy * cp * syaw, sy * cp * cy, sy * sp];
  const t = [c.target.x, c.target.y, c.target.z];
  const dot = (r: number[]) => r[0] * t[0] + r[1] * t[1] + r[2] * t[2];
  // prettier-ignore
  return new Float32Array([
    r0[0], r1[0], 0, 0,
    r0[1], r1[1], 0, 0,
    r0[2], r1[2], 0, 0,
    -dot(r0), -dot(r1), 0, 1,
  ]);
}

/**
 * Where a touch at pixel (px, py) (origin top-left) meets the plane z = groundZ.
 * Null when the view is edge-on to the ground.
 */
export function unprojectGround(
  c: Camera, width: number, height: number, px: number, py: number, groundZ = 0,
): { x: number; y: number } | null {
  if (c.perspective) {
    // Ray from the eye through the pixel, intersected with the ground plane.
    const { right, up, w, eye } = basis(c);
    const { fx, fy } = focal(width, height);
    const vx = ((2 * px) / width - 1) / fx;
    const vy = (1 - (2 * py) / height) / fy;
    const dir = [0, 1, 2].map((i) => right[i] * vx + up[i] * vy - w[i]);
    if (dir[2] >= -1e-6) return null; // ray doesn't reach the ground (at or above the horizon)
    const t = (groundZ - eye[2]) / dir[2];
    if (t <= 0) return null;
    return { x: eye[0] + dir[0] * t, y: eye[1] + dir[1] * t };
  }
  const { sx, sy } = scales(c.viewMeters, width, height);
  const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  if (Math.abs(cp) < 1e-6) return null;
  const right = ((2 * px) / width - 1) / sx;
  const up = (1 - (2 * py) / height) / sy;
  const fwd = (up - sp * (groundZ - c.target.z)) / cp;
  const cy = Math.cos(c.yaw), syaw = Math.sin(c.yaw);
  return {
    x: c.target.x + cy * right + syaw * fwd,
    y: c.target.y - syaw * right + cy * fwd,
  };
}
