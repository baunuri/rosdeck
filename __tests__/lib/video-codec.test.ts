import { detectVideoCodec } from '../../lib/video-codec';

const bytes = (...b: number[]) => Uint8Array.from(b);

describe('detectVideoCodec', () => {
  it('detects HEVC from a VPS NAL (4-byte start code)', () => {
    expect(detectVideoCodec(bytes(0, 0, 0, 1, 0x40, 0x01, 0x0c, 0x01))).toBe('h265');
  });

  it('detects H.264 from an SPS NAL (3-byte start code)', () => {
    expect(detectVideoCodec(bytes(0, 0, 1, 0x67, 0x42, 0xc0, 0x1e))).toBe('h264');
  });

  it('detects H.264 from a PPS with nal_ref_idc 1', () => {
    expect(detectVideoCodec(bytes(0, 0, 1, 0x28, 0xce, 0x3c, 0x80))).toBe('h264');
  });

  it('returns null for delta frames without parameter sets', () => {
    expect(detectVideoCodec(bytes(0, 0, 0, 1, 0x02, 0x01, 0xd0))).toBeNull(); // HEVC TRAIL_R
    expect(detectVideoCodec(bytes(0, 0, 0, 1, 0x41, 0x9a, 0x00))).toBeNull(); // H.264 slice
    expect(detectVideoCodec(bytes())).toBeNull();
  });
});
