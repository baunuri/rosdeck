/**
 * Fast CDR decoder for visualization_msgs/msg/MarkerArray (ROS 2 Jazzy layout), keeping only
 * what the 3D View draws. The generic MessageReader builds every nested field as JS objects:
 * a 7.6k-marker array (MPPI's /trajectories, 1.9 MB) took ~1 s per message in Hermes.
 * This walks the buffer once and skips textures, UVs, text and meshes by length.
 *
 * Layout per Marker: Header, string ns, int32 id/type/action, Pose (7×f64), Vector3 scale,
 * ColorRGBA, Duration lifetime, bool frame_locked, Point[] points, ColorRGBA[] colors,
 * string texture_resource, CompressedImage texture, UVCoordinate[] uv_coordinates,
 * string text, string mesh_resource, MeshFile mesh_file, bool mesh_use_embedded_materials.
 * Humble lacks texture_resource, texture, uv_coordinates and mesh_file (`jazzyLayout` false).
 */

import type { MarkerMsg } from '../widgets/view3d/markers';

/** Whether an advertised Marker schema uses the Jazzy layout (texture + mesh_file fields). */
export const isJazzyMarkerSchema = (schema: string) => /\bMeshFile\s+mesh_file\b/.test(schema);

class CdrCursor {
  private o = 4; // after the 4-byte encapsulation header; alignment is relative to here
  private readonly view: DataView;
  private readonly le: boolean;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.le = bytes[1] === 1; // CDR_LE = 0x0001, CDR_BE = 0x0000
  }

  private align(n: number) {
    const r = (this.o - 4) % n;
    if (r) this.o += n - r;
  }
  u8() { return this.bytes[this.o++]; }
  i32() { this.align(4); const v = this.view.getInt32(this.o, this.le); this.o += 4; return v; }
  u32() { this.align(4); const v = this.view.getUint32(this.o, this.le); this.o += 4; return v; }
  f32() { this.align(4); const v = this.view.getFloat32(this.o, this.le); this.o += 4; return v; }
  f64() { this.align(8); const v = this.view.getFloat64(this.o, this.le); this.o += 8; return v; }
  /** Strings here are short ASCII frame ids / namespaces; no TextDecoder per marker. */
  string() {
    const len = this.u32(); // includes the trailing NUL
    let s = '';
    for (let i = 0; i < len - 1; i++) s += String.fromCharCode(this.bytes[this.o + i]);
    this.o += len;
    return s;
  }
  skipString() { const len = this.u32(); this.o += len; }
  skipBytes() { const len = this.u32(); this.o += len; }
}

export function parseMarkerArrayFast(cdr: Uint8Array, jazzyLayout = true): { markers: MarkerMsg[] } {
  const c = new CdrCursor(cdr);
  const count = c.u32();
  const markers: MarkerMsg[] = new Array(count);
  for (let m = 0; m < count; m++) {
    c.i32(); c.u32(); // header.stamp
    const frame_id = c.string();
    const ns = c.string();
    const id = c.i32();
    const type = c.i32();
    const action = c.i32();
    const position = { x: c.f64(), y: c.f64(), z: c.f64() };
    const orientation = { x: c.f64(), y: c.f64(), z: c.f64(), w: c.f64() };
    const scale = { x: c.f64(), y: c.f64(), z: c.f64() };
    const color = { r: c.f32(), g: c.f32(), b: c.f32(), a: c.f32() };
    const lifetime = { sec: c.i32(), nanosec: c.u32() };
    c.u8(); // frame_locked
    const nPoints = c.u32();
    const points = new Array(nPoints);
    for (let i = 0; i < nPoints; i++) points[i] = { x: c.f64(), y: c.f64(), z: c.f64() };
    const nColors = c.u32();
    const colors = new Array(nColors);
    for (let i = 0; i < nColors; i++) colors[i] = { r: c.f32(), g: c.f32(), b: c.f32(), a: c.f32() };
    if (jazzyLayout) {
      c.skipString(); // texture_resource
      c.i32(); c.u32(); c.skipString(); c.skipString(); c.skipBytes(); // texture: header, format, data
      const nUv = c.u32();
      for (let i = 0; i < nUv; i++) { c.f32(); c.f32(); } // uv_coordinates
    }
    c.skipString(); // text
    c.skipString(); // mesh_resource
    if (jazzyLayout) { c.skipString(); c.skipBytes(); } // mesh_file: filename, data
    c.u8(); // mesh_use_embedded_materials
    markers[m] = {
      header: { frame_id }, ns, id, type, action, pose: { position, orientation }, scale, color, lifetime,
      points, colors,
    };
  }
  return { markers };
}
