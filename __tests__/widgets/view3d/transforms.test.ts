import {
  AdaptiveVoxelAccumulator,
  parsePointCloud2,
  parsePointCloud2Flat,
  TfPositionTracker,
  type PointCloudPoint,
} from '../../../widgets/view3d/transforms';

function makeCloud(points: Array<[number, number, number, number]>) {
  const pointStep = 48;
  const data = new Uint8Array(points.length * pointStep);
  const view = new DataView(data.buffer);
  points.forEach(([x, y, z, intensity], index) => {
    const base = index * pointStep;
    view.setFloat32(base, x, true);
    view.setFloat32(base + 4, y, true);
    view.setFloat32(base + 8, z, true);
    view.setFloat32(base + 32, intensity, true);
  });
  return {
    width: points.length,
    height: 1,
    point_step: pointStep,
    is_bigendian: false,
    fields: [
      { name: 'x', offset: 0, datatype: 7, count: 1 },
      { name: 'y', offset: 4, datatype: 7, count: 1 },
      { name: 'z', offset: 8, datatype: 7, count: 1 },
      { name: 'intensity', offset: 32, datatype: 7, count: 1 },
    ],
    data,
  };
}

describe('PointCloud2 transforms', () => {
  it('parses FLOAT32 x/y/z/intensity with padding', () => {
    expect(parsePointCloud2(makeCloud([[1.25, -2.5, 0.75, 42]]))).toEqual([
      { x: 1.25, y: -2.5, z: 0.75, intensity: 42 },
    ]);
  });

  it('parses rosbridge base64 PointCloud2 payloads', () => {
    const cloud = makeCloud([[1.5, -2, 0.25, 9]]);
    const binary = Array.from(cloud.data, (value) => String.fromCharCode(value)).join('');
    expect(parsePointCloud2({ ...cloud, data: btoa(binary) })).toEqual([
      { x: 1.5, y: -2, z: 0.25, intensity: 9 },
    ]);
  });

  it('decimates while parsing when maxPoints is set', () => {
    const cloud = makeCloud(Array.from({ length: 10 }, (_, i) => [i, 0, 0, 0] as [number, number, number, number]));
    expect(parsePointCloud2(cloud, 5).map((p) => p.x)).toEqual([0, 2, 4, 6, 8]);
    expect(parsePointCloud2(cloud, 3).map((p) => p.x)).toEqual([0, 4, 8]);
  });

  it('parses straight to a flat Float32Array, skipping non-finite points', () => {
    const cloud = makeCloud([[1, 2, 3, 0], [NaN, 0, 0, 0], [4, 5, 6, 0]]);
    expect(Array.from(parsePointCloud2Flat(cloud))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('transforms flat clouds in place like transformPointCloud', () => {
    const tracker = new TfPositionTracker();
    tracker.update({ transforms: [{
      header: { frame_id: 'map' }, child_frame_id: 'odom',
      transform: { translation: { x: 10, y: -2, z: 1 },
        rotation: { x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) } },
    }] });
    const out = tracker.transformFlat(Float32Array.from([2, 1, 0.5]), 'odom', 'map')!;
    expect(Array.from(out).map((v) => +v.toFixed(5))).toEqual([9, 0, 1.5]);
    expect(tracker.transformFlat(new Float32Array(3), 'missing', 'map')).toBeNull();
  });

  it('rejects point clouds without FLOAT32 xyz fields', () => {
    const cloud = makeCloud([[1, 2, 3, 4]]);
    cloud.fields[0].datatype = 2;
    expect(parsePointCloud2(cloud)).toEqual([]);
  });

  it('deduplicates nearby points and remains bounded', () => {
    const accumulator = new AdaptiveVoxelAccumulator(0.1, 10);
    accumulator.add([
      { x: 0.01, y: 0.01, z: 0.01, intensity: 1 },
      { x: 0.02, y: 0.02, z: 0.02, intensity: 2 },
    ]);
    expect(accumulator.pointCount).toBe(1);

    const many: PointCloudPoint[] = Array.from({ length: 100 }, (_, index) => ({
      x: index,
      y: index % 3,
      z: 0,
      intensity: index,
    }));
    accumulator.add(many);
    expect(accumulator.pointCount).toBeLessThanOrEqual(10);
    expect(accumulator.voxelSize).toBeGreaterThan(0.1);
  });

  it('resolves robot position through forward and inverse TF chains', () => {
    const tracker = new TfPositionTracker();
    tracker.update({ transforms: [
      {
        header: { frame_id: 'map_frame' },
        child_frame_id: 'odom',
        transform: {
          translation: { x: 10, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
        },
      },
      {
        header: { frame_id: 'odom' },
        child_frame_id: 'base_link',
        transform: {
          translation: { x: 2, y: 3, z: 1 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
        },
      },
    ] });
    expect(tracker.lookupPosition('map_frame', 'base_link')).toEqual({ x: 12, y: 3, z: 1 });
    expect(tracker.lookupPosition('base_link', 'map_frame')).toEqual({ x: -12, y: -3, z: -1 });
  });

  it('transforms points from the sensor frame into the fixed frame', () => {
    const tracker = new TfPositionTracker();
    tracker.update({ transforms: [{
      header: { frame_id: 'map' },
      child_frame_id: 'odom',
      transform: {
        translation: { x: 10, y: -2, z: 1 },
        rotation: {
          x: 0,
          y: 0,
          z: Math.sin(Math.PI / 4),
          w: Math.cos(Math.PI / 4),
        },
      },
    }] });

    expect(tracker.transformPointCloud([
      { x: 2, y: 1, z: 0.5, intensity: 7 },
    ], 'odom', 'map')).toEqual([{
      x: 9,
      y: 0,
      z: 1.5,
      intensity: 7,
    }]);
    expect(tracker.transformPointCloud([], 'missing', 'map')).toBeNull();
  });

  it('restores the configured voxel size after clearing', () => {
    const accumulator = new AdaptiveVoxelAccumulator(0.25, 2);
    accumulator.add(Array.from({ length: 20 }, (_, x) => ({ x, y: 0, z: 0, intensity: 0 })));
    accumulator.clear();
    expect(accumulator.voxelSize).toBe(0.25);
  });
});
