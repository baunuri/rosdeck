export function occupancyToRgba(value: number): [number, number, number, number] {
  if (value < 0) return [105, 105, 105, 255];
  const v = Math.round((value / 100) * 235 + 20);
  return [v, v, v, 255];
}

/**
 * Convert costmap occupancy to RGBA with color coding.
 * 0 = free (transparent), 1-98 = blue→red gradient, 99-100 = lethal (magenta), -1 = unknown (transparent)
 */
export function costmapToRgba(value: number, alpha: number = 180): [number, number, number, number] {
  if (value < 0 || value === 0) return [0, 0, 0, 0];
  if (value >= 99) return [200, 0, 200, alpha];
  const t = value / 100;
  const r = Math.round(Math.min(1, t * 2) * 255);
  const g = Math.round(Math.max(0, 1 - Math.abs(t - 0.5) * 2) * 200);
  const b = Math.round(Math.max(0, 1 - t * 2) * 255);
  return [r, g, b, alpha];
}

/** 256-entry RGBA lookup (packed little-endian) indexed by the int8 cell value's byte. */
function buildLut(toRgba: (value: number) => [number, number, number, number]): Uint32Array {
  const lut = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    const [r, g, b, a] = toRgba(i > 127 ? i - 256 : i);
    lut[i] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }
  return lut;
}
export const OCCUPANCY_LUT = buildLut(occupancyToRgba);
export const COSTMAP_LUT = buildLut((v) => costmapToRgba(v, 255));

/**
 * OccupancyGrid → RGBA texture pixels (rows flipped so row 0 is the grid's max-y edge),
 * one table lookup and one 32-bit write per cell, and grids
 * larger than `maxSide` are point-sampled down for display (also keeps them under the
 * GPU's texture size limit). A per-cell array version took >1 s per large Nav2 costmap.
 * ponytail: assumes a little-endian device (every Android/iOS target).
 */
export function gridToRgbaFast(
  data: ArrayLike<number>, width: number, height: number, lut: Uint32Array, maxSide = 1024,
): { pixels: Uint8Array; width: number; height: number } {
  const step = Math.max(1, Math.ceil(Math.max(width, height) / maxSide));
  const w = Math.ceil(width / step);
  const h = Math.ceil(height / step);
  const out = new Uint32Array(w * h);
  for (let row = 0; row < h; row++) {
    const src = (h - 1 - row) * step * width; // output row r covers the block starting at grid row (h-1-r)·step
    const dst = row * w;
    for (let col = 0; col < w; col++) out[dst + col] = lut[(data[src + col * step] ?? -1) & 0xff];
  }
  return { pixels: new Uint8Array(out.buffer), width: w, height: h };
}
