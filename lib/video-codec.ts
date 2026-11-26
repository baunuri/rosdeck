/**
 * Detects H.264 vs H.265 from the parameter-set NAL units at the start of an
 * Annex-B keyframe. Needed because some publishers mislabel the `format` field
 * (foxglove_compressed_video_transport 3.0.x always says "h264", even for libx265).
 *
 * HEVC VPS/SPS/PPS headers (0x40-0x45, then 0x01) read as H.264 types 0-5, and
 * H.264 SPS/PPS headers read as HEVC types 3/4/19/20/35/36/51/52, so they never collide.
 * Returns null for frames without parameter sets (delta frames).
 */
export function detectVideoCodec(bytes: Uint8Array, scanLimit = 256): 'h264' | 'h265' | null {
  const end = Math.min(bytes.length - 2, scanLimit);
  for (let i = 0; i < end; i++) {
    if (bytes[i] !== 0 || bytes[i + 1] !== 0 || bytes[i + 2] !== 1) continue;
    const header = bytes[i + 3];
    if (header === undefined) return null;
    const hevcType = (header >> 1) & 0x3f;
    if (hevcType >= 32 && hevcType <= 34 && bytes[i + 4] === 0x01) return 'h265';
    const avcType = header & 0x1f;
    if (avcType === 7 || avcType === 8) return 'h264';
    i += 2;
  }
  return null;
}
