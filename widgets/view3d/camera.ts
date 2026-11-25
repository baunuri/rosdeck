/**
 * Orthographic orbit camera, like RViz's Orbit / TopDownOrtho views.
 *
 * In view coordinates relative to `target` (all in the fixed frame, metres):
 *   right = cos(yaw)·dx − sin(yaw)·dy
 *   fwd   = sin(yaw)·dx + cos(yaw)·dy
 *   up    = cos(pitch)·fwd + sin(pitch)·dz      (pitch 0 = top-down, x right / y up)
 * `viewMeters` is how many metres the shorter screen edge spans.
 */
export interface Camera {
  yaw: number;
  pitch: number;
  viewMeters: number;
  target: { x: number; y: number; z: number };
}

function scales(viewMeters: number, width: number, height: number) {
  const pixelsPerMeter = Math.min(width, height) / Math.max(1e-6, viewMeters);
  return { sx: (2 * pixelsPerMeter) / width, sy: (2 * pixelsPerMeter) / height };
}

/** Column-major 4×4 matrix taking fixed-frame points to clip space. */
export function viewProjection(c: Camera, width: number, height: number): Float32Array {
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
