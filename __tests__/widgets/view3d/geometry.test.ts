import { arrow, gridCorners, gridLines, laserScanToXyz, pathToXyz, yawOf } from '../../../widgets/view3d/geometry';

const quatYaw = (yaw: number) => ({ x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) });
const round = (a: ArrayLike<number>) => Array.from(a, (v) => +v.toFixed(4) + 0);

describe('view3d geometry', () => {
  it('reads yaw from a quaternion', () => {
    expect(yawOf(quatYaw(1.2))).toBeCloseTo(1.2);
  });

  it('grid has two lines per step plus the centre lines', () => {
    expect(gridLines(2, 1).length).toBe((2 * 2 + 1) * 2 * 6);
  });

  it('arrow tip points along yaw', () => {
    const a = arrow(1, 2, 0, Math.PI / 2, 1);
    expect(round(a.slice(0, 3))).toEqual([1, 3, 0]); // tip 1 m along +y
    expect(a.length).toBe(9 * 3);
  });

  it('grid corners honour origin position, rotation and size', () => {
    const corners = gridCorners({
      width: 4, height: 2, resolution: 0.5,
      origin: { position: { x: 10, y: 0, z: 0 }, orientation: quatYaw(Math.PI / 2) },
    }, 0.01);
    // 2 m along the grid's x (rotated to +y), 1 m along its y (rotated to -x)
    expect(round(corners)).toEqual([10, 0, 0.01, 10, 2, 0.01, 9, 0, 0.01, 9, 2, 0.01]);
  });

  it('laser scan keeps only in-range returns', () => {
    const xyz = laserScanToXyz({
      angle_min: 0, angle_increment: Math.PI / 2, range_min: 0.1, range_max: 10,
      ranges: [1, Infinity, 2, 0.05, NaN],
    });
    expect(round(xyz)).toEqual([1, 0, 0, -2, 0, 0]);
  });

  it('path becomes a polyline', () => {
    expect(round(pathToXyz({ poses: [
      { pose: { position: { x: 0, y: 0, z: 0 } } },
      { pose: { position: { x: 1, y: 2, z: 0 } } },
    ] }))).toEqual([0, 0, 0, 1, 2, 0]);
  });
});
