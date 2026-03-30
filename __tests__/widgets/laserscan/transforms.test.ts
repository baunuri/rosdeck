import { polarToCartesian, laserScanToPoints } from '../../../widgets/laserscan/transforms';

describe('polarToCartesian', () => {
  it('converts angle 0 and range 1 to (1, 0)', () => {
    const [x, y] = polarToCartesian(0, 1);
    expect(x).toBeCloseTo(1);
    expect(y).toBeCloseTo(0);
  });

  it('converts angle PI/2 and range 1 to (0, 1)', () => {
    const [x, y] = polarToCartesian(Math.PI / 2, 1);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(1);
  });

  it('handles zero range', () => {
    const [x, y] = polarToCartesian(1.5, 0);
    expect(x).toBe(0);
    expect(y).toBe(0);
  });
});

describe('laserScanToPoints', () => {
  it('converts a simple scan to Cartesian points', () => {
    const scan = {
      angle_min: 0,
      angle_increment: Math.PI / 2,
      range_min: 0.1,
      range_max: 10,
      ranges: [1, 2, 3],
    };
    const points = laserScanToPoints(scan);
    expect(points).toHaveLength(3);
    expect(points[0][0]).toBeCloseTo(1);
    expect(points[0][1]).toBeCloseTo(0);
  });

  it('filters out-of-range values', () => {
    const scan = {
      angle_min: 0,
      angle_increment: Math.PI / 4,
      range_min: 0.1,
      range_max: 5,
      ranges: [1, Infinity, NaN, 0.01, 3],
    };
    const points = laserScanToPoints(scan);
    expect(points).toHaveLength(2);
  });
});
