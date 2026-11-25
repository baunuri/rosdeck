import type { WidgetDefinition } from '../../types/layout';
import { View3DWidget } from './View3DWidget';

const GRID = ['nav_msgs/msg/OccupancyGrid'];

export const view3dWidget: WidgetDefinition = {
  type: 'view3d',
  name: '3D View',
  icon: 'cube-outline',
  category: 'nav',
  supportedMessageTypes: [
    'nav_msgs/msg/OccupancyGrid', 'sensor_msgs/msg/LaserScan', 'sensor_msgs/msg/PointCloud2', 'nav_msgs/msg/Path',
  ],
  defaultConfig: {
    fixedFrame: 'map',
    robotFrame: 'base_link',
    mapTopic: '/map',
    globalCostmapTopic: '/global_costmap/costmap',
    localCostmapTopic: '/local_costmap/costmap',
    costmapOpacity: 0.5,
    scanTopic: '/scan',
    cloudTopic: '',
    accumulate: false,
    pathTopic: '/plan',
    enableGoal: true,
    goalTopic: '/goal_pose',
    enablePoseEstimate: true,
    poseEstimateTopic: '/initialpose',
    showGrid: true,
    topDown: false,
    viewMeters: 20,
  },
  configSchema: [
    { key: 'fixedFrame', label: 'Fixed Frame', type: 'text', placeholder: 'map' },
    { key: 'robotFrame', label: 'Robot Frame', type: 'text', placeholder: 'base_link' },
    { key: 'mapTopic', label: 'Map', type: 'topic', topicMessageTypes: GRID },
    { key: 'globalCostmapTopic', label: 'Global Costmap', type: 'topic', topicMessageTypes: GRID },
    { key: 'localCostmapTopic', label: 'Local Costmap', type: 'topic', topicMessageTypes: GRID },
    { key: 'costmapOpacity', label: 'Costmap Opacity', type: 'slider', min: 0.1, max: 1, step: 0.1 },
    { key: 'scanTopic', label: 'Laser Scan', type: 'topic', topicMessageTypes: ['sensor_msgs/msg/LaserScan'] },
    { key: 'cloudTopic', label: 'Point Cloud', type: 'topic', topicMessageTypes: ['sensor_msgs/msg/PointCloud2'] },
    { key: 'accumulate', label: 'Accumulate Cloud (build a map)', type: 'boolean' },
    { key: 'pathTopic', label: 'Path', type: 'topic', topicMessageTypes: ['nav_msgs/msg/Path'] },
    { key: 'enableGoal', label: 'Nav Goal Tool (hold + drag)', type: 'boolean' },
    { key: 'goalTopic', label: 'Goal Topic', type: 'text', placeholder: '/goal_pose', visibleWhen: { key: 'enableGoal', value: true } },
    { key: 'enablePoseEstimate', label: 'Pose Estimate Tool', type: 'boolean' },
    { key: 'poseEstimateTopic', label: 'Pose Estimate Topic', type: 'text', placeholder: '/initialpose', visibleWhen: { key: 'enablePoseEstimate', value: true } },
    { key: 'showGrid', label: 'Show Grid', type: 'boolean' },
    { key: 'topDown', label: 'Start in Top-Down View', type: 'boolean' },
    { key: 'viewMeters', label: 'Default View Size (m)', type: 'number', placeholder: '20' },
  ],
  component: View3DWidget as any,
};
