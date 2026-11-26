import {
  COSTMAP_LUT,
  costmapToRgba,
  gridToRgbaFast,
  OCCUPANCY_LUT,
  occupancyToRgba,
} from '../../../widgets/map/transforms';

/** Straightforward per-cell reference: row 0 of the output is the grid's max-y row. */
function reference(data: ArrayLike<number>, width: number, height: number, toRgba: (v: number) => number[]) {
  const out: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) out.push(...toRgba(data[(height - 1 - row) * width + col]));
  }
  return out;
}

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

describe('gridToRgbaFast', () => {
  const data = Int8Array.from([-1, 0, 50, 100, 99, 1, 30, -1, 0, 75, 100, 10]);

  it('matches a per-cell occupancy reference exactly', () => {
    expect(Array.from(gridToRgbaFast(data, 4, 3, OCCUPANCY_LUT).pixels)).toEqual(reference(data, 4, 3, occupancyToRgba));
  });

  it('matches a per-cell costmap reference exactly', () => {
    expect(Array.from(gridToRgbaFast(data, 4, 3, COSTMAP_LUT).pixels)).toEqual(reference(data, 4, 3, (v) => costmapToRgba(v, 255)));
  });

  it('samples large grids down to maxSide, keeping corner cells', () => {
    const big = new Int8Array(8 * 4).fill(0);
    big[0] = 100; // grid (0,0): bottom-left, ends up in the last output row
    const out = gridToRgbaFast(big, 8, 4, OCCUPANCY_LUT, 4);
    expect([out.width, out.height]).toEqual([4, 2]);
    const lastRowFirstPixel = Array.from(out.pixels.slice((1 * 4) * 4, (1 * 4) * 4 + 4));
    expect(lastRowFirstPixel).toEqual([255, 255, 255, 255]);
  });
});
