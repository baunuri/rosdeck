import { suggestLayout } from '../../lib/topic-detection';

describe('suggestLayout', () => {
  it('suggests drive-camera when CompressedImage and Twist topics exist', () => {
    const result = suggestLayout([
      { name: '/cmd_vel', type: 'geometry_msgs/msg/Twist' },
      { name: '/camera/image_raw/compressed', type: 'sensor_msgs/msg/CompressedImage' },
    ]);
    expect(result?.presetId).toBe('drive-camera');
  });

  it('suggests nav when OccupancyGrid and Twist topics exist', () => {
    const result = suggestLayout([
      { name: '/cmd_vel', type: 'geometry_msgs/msg/Twist' },
      { name: '/map', type: 'nav_msgs/msg/OccupancyGrid' },
    ]);
    expect(result?.presetId).toBe('nav');
  });

  it('suggests dashboard when CompressedImage, OccupancyGrid, and Twist exist', () => {
    const result = suggestLayout([
      { name: '/cmd_vel', type: 'geometry_msgs/msg/Twist' },
      { name: '/camera/image_raw/compressed', type: 'sensor_msgs/msg/CompressedImage' },
      { name: '/map', type: 'nav_msgs/msg/OccupancyGrid' },
    ]);
    expect(result?.presetId).toBe('dashboard');
  });

  it('suggests camera-only when only CompressedImage topic exists', () => {
    const result = suggestLayout([
      { name: '/camera/image_raw/compressed', type: 'sensor_msgs/msg/CompressedImage' },
    ]);
    expect(result?.presetId).toBe('camera-only');
  });

  it('ignores raw Image topics (only CompressedImage is supported)', () => {
    const result = suggestLayout([
      { name: '/camera/image_raw', type: 'sensor_msgs/msg/Image' },
    ]);
    expect(result).toBeNull();
  });

  it('suggests drive when only Twist topic exists', () => {
    const result = suggestLayout([
      { name: '/cmd_vel', type: 'geometry_msgs/msg/Twist' },
    ]);
    expect(result?.presetId).toBe('drive');
  });

  it('returns null for empty topic list', () => {
    expect(suggestLayout([])).toBeNull();
  });

  it('detects TwistStamped as Twist', () => {
    const result = suggestLayout([
      { name: '/cmd_vel', type: 'geometry_msgs/msg/TwistStamped' },
    ]);
    expect(result?.presetId).toBe('drive');
  });

  it('populates widgetConfigs with actual topic names', () => {
    const result = suggestLayout([
      { name: '/turtle1/cmd_vel', type: 'geometry_msgs/msg/Twist' },
      { name: '/usb_cam/compressed', type: 'sensor_msgs/msg/CompressedImage' },
    ]);
    expect(result?.widgetConfigs.camera?.topic).toBe('/usb_cam/compressed');
  });

  it('includes detected topics in result', () => {
    const result = suggestLayout([
      { name: '/cmd_vel', type: 'geometry_msgs/msg/Twist' },
      { name: '/camera/compressed', type: 'sensor_msgs/msg/CompressedImage' },
    ]);
    expect(result?.detectedTopics).toHaveLength(2);
    expect(result?.detectedTopics[0]).toHaveProperty('name');
    expect(result?.detectedTopics[0]).toHaveProperty('type');
    expect(result?.detectedTopics[0]).toHaveProperty('widgetType');
  });
});
