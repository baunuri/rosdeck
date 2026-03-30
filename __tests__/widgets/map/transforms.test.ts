import {
  occupancyToRgba,
  gridToWorld,
  worldToGrid,
  worldToCanvas,
  canvasToWorld,
} from '../../../widgets/map/transforms';

describe('occupancyToRgba', () => {
  it('maps unknown (-1) to dark gray', () => {
    const rgba = occupancyToRgba(-1);
    expect(rgba).toEqual([105, 105, 105, 255]);
  });

  it('maps free space (0) to near-black', () => {
    const rgba = occupancyToRgba(0);
    expect(rgba).toEqual([20, 20, 20, 255]);
  });

  it('maps occupied (100) to white', () => {
    const rgba = occupancyToRgba(100);
    expect(rgba).toEqual([255, 255, 255, 255]);
  });

  it('maps mid-range (50) to mid-gray', () => {
    const rgba = occupancyToRgba(50);
    expect(rgba[0]).toBeGreaterThan(100);
    expect(rgba[0]).toBeLessThan(180);
  });
});

describe('gridToWorld', () => {
  it('converts grid cell to world coordinates', () => {
    const origin = { x: -10, y: -10 };
    const resolution = 0.05;
    const [wx, wy] = gridToWorld(100, 200, resolution, origin);
    expect(wx).toBeCloseTo(-10 + 100 * 0.05);
    expect(wy).toBeCloseTo(-10 + 200 * 0.05);
  });
});

describe('worldToGrid', () => {
  it('converts world coordinates to grid cell', () => {
    const origin = { x: -10, y: -10 };
    const resolution = 0.05;
    const [gx, gy] = worldToGrid(-5, 0, resolution, origin);
    expect(gx).toBe(100);
    expect(gy).toBe(200);
  });
});

describe('worldToCanvas / canvasToWorld', () => {
  const mapInfo = { width: 200, height: 200, resolution: 0.05, origin: { x: -5, y: -5 } };
  const canvasWidth = 300;
  const canvasHeight = 300;
  const fitScale = 1.5; // 300/200
  const zoom = 1;
  const panX = 0;
  const panY = 0;

  it('worldToCanvas converts origin to bottom-left of map on canvas', () => {
    const [cx, cy] = worldToCanvas(-5, -5, mapInfo, canvasWidth, canvasHeight, fitScale, zoom, panX, panY);
    // gridX=0, gridY=200 (bottom of map flipped to top), totalScale=1.5
    // offsetX = 0 + (300 - 200*1.5)/2 = 0
    // offsetY = 0 + (300 - 200*1.5)/2 = 0
    // cx = 0 + 0*1.5 = 0, cy = 0 + 200*1.5 = 300
    expect(cx).toBeCloseTo(0);
    expect(cy).toBeCloseTo(300);
  });

  it('worldToCanvas converts top-right world corner', () => {
    // top-right world: x=5, y=5 (origin + 200*0.05 = 10, -5+10=5)
    const [cx, cy] = worldToCanvas(5, 5, mapInfo, canvasWidth, canvasHeight, fitScale, zoom, panX, panY);
    // gridX=(5-(-5))/0.05=200, gridY=200-(5-(-5))/0.05=0
    expect(cx).toBeCloseTo(300);
    expect(cy).toBeCloseTo(0);
  });

  it('canvasToWorld is the inverse of worldToCanvas', () => {
    const wx = 1.5, wy = 2.3;
    const [cx, cy] = worldToCanvas(wx, wy, mapInfo, canvasWidth, canvasHeight, fitScale, zoom, panX, panY);
    const [rx, ry] = canvasToWorld(cx, cy, mapInfo, canvasWidth, canvasHeight, fitScale, zoom, panX, panY);
    expect(rx).toBeCloseTo(wx);
    expect(ry).toBeCloseTo(wy);
  });

  it('roundtrips with zoom and pan', () => {
    const z = 2, px = 30, py = -15;
    const wx = -2, wy = 3;
    const [cx, cy] = worldToCanvas(wx, wy, mapInfo, canvasWidth, canvasHeight, fitScale, z, px, py);
    const [rx, ry] = canvasToWorld(cx, cy, mapInfo, canvasWidth, canvasHeight, fitScale, z, px, py);
    expect(rx).toBeCloseTo(wx);
    expect(ry).toBeCloseTo(wy);
  });
});
