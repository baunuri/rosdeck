import { unprojectGround, viewProjection, type Camera } from '../../../widgets/view3d/camera';

/** Applies the column-major matrix and returns pixel coordinates (origin top-left). */
function toPixels(c: Camera, w: number, h: number, p: [number, number, number]) {
  const m = viewProjection(c, w, h);
  const clipX = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
  const clipY = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
  const clipW = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  return { px: ((clipX / clipW + 1) / 2) * w, py: ((1 - clipY / clipW) / 2) * h };
}

const W = 400, H = 200;

describe('view3d camera', () => {
  it('top-down view puts +x right and +y up, centred on the target', () => {
    const c: Camera = { yaw: 0, pitch: 0, viewMeters: 20, target: { x: 5, y: 5, z: 0 } };
    const centre = toPixels(c, W, H, [5, 5, 0]);
    expect(centre.px).toBeCloseTo(200);
    expect(centre.py).toBeCloseTo(100);
    const right = toPixels(c, W, H, [6, 5, 0]);
    const up = toPixels(c, W, H, [5, 6, 0]);
    expect(right.px).toBeCloseTo(210); // 200 px short edge / 20 m = 10 px/m
    expect(up.py).toBeCloseTo(90);
  });

  it('tilted view draws higher points higher on screen', () => {
    const c: Camera = { yaw: 0.3, pitch: 0.8, viewMeters: 20, target: { x: 0, y: 0, z: 0 } };
    expect(toPixels(c, W, H, [1, 2, 3]).py).toBeLessThan(toPixels(c, W, H, [1, 2, 0]).py);
  });

  it('unprojectGround inverts the projection on the ground plane', () => {
    const c: Camera = { yaw: -0.7, pitch: 0.75, viewMeters: 15, target: { x: 3, y: -2, z: 0.4 } };
    const { px, py } = toPixels(c, W, H, [6.25, 1.5, 0]);
    const hit = unprojectGround(c, W, H, px, py)!;
    expect(hit.x).toBeCloseTo(6.25, 4);
    expect(hit.y).toBeCloseTo(1.5, 4);
  });

  it('unprojectGround refuses an edge-on view', () => {
    const c: Camera = { yaw: 0, pitch: Math.PI / 2, viewMeters: 20, target: { x: 0, y: 0, z: 1 } };
    expect(unprojectGround(c, W, H, 10, 10)).toBeNull();
  });

  describe('perspective', () => {
    const c: Camera = { yaw: -0.4, pitch: 0.8, viewMeters: 20, target: { x: 2, y: 1, z: 0 }, perspective: true };

    it('puts the target at the centre and keeps its scale like the orthographic view', () => {
      const centre = toPixels(c, W, H, [2, 1, 0]);
      expect(centre.px).toBeCloseTo(200, 3);
      expect(centre.py).toBeCloseTo(100, 3);
      // 1 m to the camera's right at the target: 200 px short edge / 20 m = 10 px
      const r = toPixels(c, W, H, [2 + Math.cos(-0.4), 1 - Math.sin(-0.4), 0]);
      expect(r.px - 200).toBeCloseTo(10, 1);
    });

    it('draws nearer things bigger than farther things', () => {
      const span = (y: number) => {
        const a = toPixels({ ...c, yaw: 0 }, W, H, [-1, y, 0]);
        const b = toPixels({ ...c, yaw: 0 }, W, H, [1, y, 0]);
        return b.px - a.px;
      };
      expect(span(-5)).toBeGreaterThan(span(5)); // yaw 0: -y is towards the camera
    });

    it('unprojectGround inverts the projection', () => {
      const { px, py } = toPixels(c, W, H, [5.5, -3.25, 0]);
      const hit = unprojectGround(c, W, H, px, py)!;
      expect(hit.x).toBeCloseTo(5.5, 3);
      expect(hit.y).toBeCloseTo(-3.25, 3);
    });

    it('returns null above the horizon', () => {
      expect(unprojectGround({ ...c, pitch: 1.45 }, W, H, 200, 0)).toBeNull();
    });
  });
});
