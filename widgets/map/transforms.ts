export function occupancyToRgba(value: number): [number, number, number, number] {
  if (value < 0) return [105, 105, 105, 255];
  const v = Math.round((value / 100) * 235 + 20);
  return [v, v, v, 255];
}

export function occupancyGridToPixels(data: number[], width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const srcIdx = (height - 1 - row) * width + col;
      const dstIdx = (row * width + col) * 4;
      const [r, g, b, a] = occupancyToRgba(data[srcIdx] ?? -1);
      pixels[dstIdx] = r;
      pixels[dstIdx + 1] = g;
      pixels[dstIdx + 2] = b;
      pixels[dstIdx + 3] = a;
    }
  }
  return pixels;
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

export function costmapGridToPixels(data: number[], width: number, height: number, alpha: number = 180): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const srcIdx = (height - 1 - row) * width + col;
      const dstIdx = (row * width + col) * 4;
      const [r, g, b, a] = costmapToRgba(data[srcIdx] ?? -1, alpha);
      pixels[dstIdx] = r;
      pixels[dstIdx + 1] = g;
      pixels[dstIdx + 2] = b;
      pixels[dstIdx + 3] = a;
    }
  }
  return pixels;
}

export function gridToWorld(
  gridX: number,
  gridY: number,
  resolution: number,
  origin: { x: number; y: number },
): [number, number] {
  return [origin.x + gridX * resolution, origin.y + gridY * resolution];
}

export function worldToGrid(
  worldX: number,
  worldY: number,
  resolution: number,
  origin: { x: number; y: number },
): [number, number] {
  return [
    Math.round((worldX - origin.x) / resolution),
    Math.round((worldY - origin.y) / resolution),
  ];
}

export function worldToCanvas(
  worldX: number, worldY: number,
  mapInfo: { width: number; height: number; resolution: number; origin: { x: number; y: number } },
  canvasWidth: number, canvasHeight: number,
  fitScale: number, zoom: number, panX: number, panY: number
): [number, number] {
  const gridX = (worldX - mapInfo.origin.x) / mapInfo.resolution;
  const gridY = mapInfo.height - (worldY - mapInfo.origin.y) / mapInfo.resolution;
  const totalScale = fitScale * zoom;
  const offsetX = panX + (canvasWidth - mapInfo.width * totalScale) / 2;
  const offsetY = panY + (canvasHeight - mapInfo.height * totalScale) / 2;
  return [offsetX + gridX * totalScale, offsetY + gridY * totalScale];
}

export function canvasToWorld(
  canvasX: number, canvasY: number,
  mapInfo: { width: number; height: number; resolution: number; origin: { x: number; y: number } },
  canvasWidth: number, canvasHeight: number,
  fitScale: number, zoom: number, panX: number, panY: number
): [number, number] {
  const totalScale = fitScale * zoom;
  const offsetX = panX + (canvasWidth - mapInfo.width * totalScale) / 2;
  const offsetY = panY + (canvasHeight - mapInfo.height * totalScale) / 2;
  const gridX = (canvasX - offsetX) / totalScale;
  const gridY = (canvasY - offsetY) / totalScale;
  const worldX = mapInfo.origin.x + gridX * mapInfo.resolution;
  const worldY = mapInfo.origin.y + (mapInfo.height - gridY) * mapInfo.resolution;
  return [worldX, worldY];
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
 * Same pixels as occupancyGridToPixels / costmapGridToPixels (rows flipped so row 0 is
 * the grid's max-y edge), but one table lookup and one 32-bit write per cell, and grids
 * larger than `maxSide` are point-sampled down for display (also keeps them under the
 * GPU's texture size limit). The per-cell array version took >1 s per large costmap.
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
