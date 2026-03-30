// widgets/imu/math.ts

/** Convert quaternion to roll/pitch/yaw (ZYX Tait-Bryan, aerospace convention). */
export function quaternionToEuler(q: {
  x: number;
  y: number;
  z: number;
  w: number;
}): { roll: number; pitch: number; yaw: number } {
  const sinr = 2 * (q.w * q.x + q.y * q.z);
  const cosr = 1 - 2 * (q.x * q.x + q.y * q.y);
  const roll = Math.atan2(sinr, cosr);

  const sinp = 2 * (q.w * q.y - q.z * q.x);
  const pitch =
    Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp);

  const siny = 2 * (q.w * q.z + q.x * q.y);
  const cosy = 1 - 2 * (q.y * q.y + q.z * q.z);
  const yaw = Math.atan2(siny, cosy);

  return { roll, pitch, yaw };
}

/** Radians to degrees. */
export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Compute true compass heading from magnetometer + IMU orientation.
 * Projects magnetic field vector onto the horizontal plane using the
 * IMU-reported orientation, then computes the angle to magnetic north.
 * Returns heading in radians [0, 2π), with 0 = North, π/2 = East.
 */
export function computeMagneticHeading(
  mag: { x: number; y: number; z: number },
  q: { x: number; y: number; z: number; w: number },
): number {
  // Rotate mag vector into world frame using quaternion
  const qx = q.x,
    qy = q.y,
    qz = q.z,
    qw = q.w;
  const mx = mag.x,
    my = mag.y,
    mz = mag.z;

  // Rotation matrix from quaternion (first two rows only — we need world X/Y)
  const r00 = 1 - 2 * (qy * qy + qz * qz);
  const r01 = 2 * (qx * qy - qw * qz);
  const r02 = 2 * (qx * qz + qw * qy);
  const r10 = 2 * (qx * qy + qw * qz);
  const r11 = 1 - 2 * (qx * qx + qz * qz);
  const r12 = 2 * (qy * qz - qw * qx);

  const hx = r00 * mx + r01 * my + r02 * mz;
  const hy = r10 * mx + r11 * my + r12 * mz;

  // atan2 gives angle from X-axis; we want angle from Y-axis (North)
  let heading = Math.atan2(hx, hy);
  if (heading < 0) heading += 2 * Math.PI;
  return heading;
}

/**
 * Normalize yaw to [0, 2π) for display as a heading.
 */
export function yawToHeading(yaw: number): number {
  let h = yaw;
  if (h < 0) h += 2 * Math.PI;
  return h;
}
