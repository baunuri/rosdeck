import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '@foxglove/rosmsg';
import { MessageReader, MessageWriter } from '@foxglove/rosmsg2-serialization';
import { parseMarkerArrayFast } from '../../lib/marker-cdr';

// Schema exactly as foxglove_bridge advertises it on ROS 2 Jazzy (includes texture/mesh fields).
const defs = parse(readFileSync(join(__dirname, '../fixtures/visualization_msgs-MarkerArray.jazzy.msg'), 'utf8'), { ros2: true });
const writer = new MessageWriter(defs);
const reader = new MessageReader(defs);

const marker = (over: Record<string, any>) => ({
  header: { stamp: { sec: 1, nanosec: 2 }, frame_id: 'lio_odom' },
  ns: 'traj', id: 0, type: 2, action: 0,
  pose: { position: { x: 1.5, y: -2, z: 0.25 }, orientation: { x: 0, y: 0, z: 0.38, w: 0.92 } },
  scale: { x: 0.1, y: 0.2, z: 0.3 },
  color: { r: 0.1, g: 0.2, b: 0.3, a: 1 },
  lifetime: { sec: 0, nanosec: 500 },
  frame_locked: true,
  points: [], colors: [],
  texture_resource: 'tex://x',
  texture: { header: { stamp: { sec: 0, nanosec: 0 }, frame_id: 'cam' }, format: 'png', data: new Uint8Array([1, 2, 3]) },
  uv_coordinates: [{ u: 0.5, v: 0.25 }],
  text: 'hello', mesh_resource: 'package://m.dae',
  mesh_file: { filename: 'm.stl', data: new Uint8Array([9, 9]) },
  mesh_use_embedded_materials: true,
  ...over,
});

describe('parseMarkerArrayFast', () => {
  it('matches the generic reader on every field the 3D View uses', () => {
    const msg = { markers: [
      marker({ id: 1 }),
      marker({ id: 2, type: 4, ns: 'line', points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 2, z: 3 }],
        colors: [{ r: 1, g: 0, b: 0, a: 1 }, { r: 0, g: 1, b: 0, a: 0.5 }] }),
      marker({ id: 3, action: 3, header: { stamp: { sec: 0, nanosec: 0 }, frame_id: 'map' } }),
    ] };
    const bytes = writer.writeMessage(msg);
    const fast = parseMarkerArrayFast(bytes).markers;
    const slow = (reader.readMessage(bytes) as any).markers;
    expect(fast).toHaveLength(3);
    fast.forEach((f, i) => {
      const s = slow[i];
      expect(f.header?.frame_id).toBe(s.header.frame_id);
      expect([f.ns, f.id, f.type, f.action]).toEqual([s.ns, s.id, s.type, s.action]);
      expect(f.pose).toEqual(s.pose);
      expect(f.scale).toEqual(s.scale);
      for (const k of ['r', 'g', 'b', 'a'] as const) expect(f.color![k]).toBeCloseTo(s.color[k], 6);
      expect(f.lifetime).toEqual(s.lifetime);
      expect(f.points).toEqual(s.points);
      expect(f.colors?.map((c) => c.g)).toEqual(s.colors.map((c: any) => expect.closeTo(c.g, 6)));
    });
  });

  it('decodes an empty array', () => {
    expect(parseMarkerArrayFast(writer.writeMessage({ markers: [] })).markers).toEqual([]);
  });
});

describe('parseMarkerArrayFast on the Humble layout', () => {
  it('detects the layout from the schema and decodes without the Jazzy-only fields', () => {
    const { isJazzyMarkerSchema } = require('../../lib/marker-cdr');
    const jazzy = readFileSync(join(__dirname, '../fixtures/visualization_msgs-MarkerArray.jazzy.msg'), 'utf8');
    expect(isJazzyMarkerSchema(jazzy)).toBe(true);
    const humble = jazzy
      .replace(/^string texture_resource.*$/m, '').replace(/^sensor_msgs\/CompressedImage texture.*$/m, '')
      .replace(/^UVCoordinate\[\] uv_coordinates.*$/m, '').replace(/^MeshFile mesh_file.*$/m, '');
    expect(isJazzyMarkerSchema(humble)).toBe(false);
    const hdefs = parse(humble, { ros2: true });
    const bytes = new MessageWriter(hdefs).writeMessage({ markers: [marker({ id: 7, points: [{ x: 1, y: 2, z: 3 }] })] });
    const fast = parseMarkerArrayFast(bytes, false).markers;
    expect(fast[0].id).toBe(7);
    expect(fast[0].points).toEqual([{ x: 1, y: 2, z: 3 }]);
  });
});
