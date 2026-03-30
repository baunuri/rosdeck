export function polarToCartesian(angle: number, range: number): [number, number] {
  return [range * Math.cos(angle), range * Math.sin(angle)];
}

export function laserScanToPoints(scan: {
  angle_min: number;
  angle_increment: number;
  range_min: number;
  range_max: number;
  ranges: number[];
}): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i < scan.ranges.length; i++) {
    const range = scan.ranges[i];
    if (!isFinite(range) || range < scan.range_min || range > scan.range_max) continue;
    const angle = scan.angle_min + i * scan.angle_increment;
    points.push(polarToCartesian(angle, range));
  }
  return points;
}
