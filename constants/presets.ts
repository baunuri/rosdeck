import { createWidgetNode, createSplitNode, type LayoutNode, type SavedLayout } from '../types/layout';
import { DEFAULTS } from './defaults';

export interface PresetTemplate {
  id: string;
  name: string;
  buildTree: () => LayoutNode;
}

export const PRESET_TEMPLATES: PresetTemplate[] = [
  {
    id: 'drive',
    name: 'Drive',
    buildTree: () => createWidgetNode('joystick', { topic: DEFAULTS.cmdVelTopic, maxLinearVel: DEFAULTS.maxLinearVel, maxAngularVel: DEFAULTS.maxAngularVel, useTwistStamped: true, frameId: 'base_link' }),
  },
  {
    id: 'drive-camera',
    name: 'Drive + Camera',
    buildTree: () =>
      createSplitNode('vertical',
        createWidgetNode('camera', { topic: DEFAULTS.cameraTopic, source: 'mjpeg', mjpegPort: DEFAULTS.mjpegPort }),
        createWidgetNode('joystick', { topic: DEFAULTS.cmdVelTopic, maxLinearVel: DEFAULTS.maxLinearVel, maxAngularVel: DEFAULTS.maxAngularVel, useTwistStamped: true, frameId: 'base_link' }),
        0.6
      ),
  },
  {
    id: 'camera-only',
    name: 'Camera Only',
    buildTree: () => createWidgetNode('camera', { topic: DEFAULTS.cameraTopic, source: 'mjpeg', mjpegPort: DEFAULTS.mjpegPort }),
  },
  {
    id: 'nav',
    name: 'Nav',
    buildTree: () =>
      createSplitNode('vertical',
        createWidgetNode('map', { topic: '/map', enableNav2Goal: false, nav2GoalTopic: '/goal_pose' }),
        createWidgetNode('joystick', { topic: DEFAULTS.cmdVelTopic, maxLinearVel: DEFAULTS.maxLinearVel, maxAngularVel: DEFAULTS.maxAngularVel, useTwistStamped: true, frameId: 'base_link' }),
        0.6
      ),
  },
  {
    id: 'dashboard',
    name: 'Dashboard',
    buildTree: () =>
      createSplitNode('horizontal',
        createSplitNode('vertical',
          createWidgetNode('map', { topic: '/map', scanTopic: '/scan', odomTopic: '/odom', enableNav2Goal: false, nav2GoalTopic: '/goal_pose' }),
          createSplitNode('vertical',
            createWidgetNode('battery', { topic: '/battery_state' }),
            createWidgetNode('diagnostics', { topic: '/diagnostics' }),
            0.5
          ),
          0.6
        ),
        createSplitNode('vertical',
          createWidgetNode('camera', { topic: '/camera/image_raw', source: 'transport', mjpegPort: DEFAULTS.mjpegPort }),
          createSplitNode('vertical',
            createWidgetNode('chart', {
              series: [
                { topic: '/battery_state', messageType: 'sensor_msgs/msg/BatteryState', field: 'voltage', label: 'Voltage', color: '#4A9EFF' },
                { topic: '/odom', messageType: 'nav_msgs/msg/Odometry', field: 'twist.twist.linear.x', label: 'Lin Vel', color: '#34D399' },
              ],
              windowSec: 30,
            }),
            createWidgetNode('joystick', { topic: DEFAULTS.cmdVelTopic, maxLinearVel: DEFAULTS.maxLinearVel, maxAngularVel: DEFAULTS.maxAngularVel, useTwistStamped: true, frameId: 'base_link' }),
            0.5
          ),
          0.35
        ),
        0.6
      ),
  },
];

export function buildDefaultLayouts(): SavedLayout[] {
  return PRESET_TEMPLATES.map((preset) => ({
    id: preset.id,
    name: preset.name,
    tree: preset.buildTree(),
  }));
}
