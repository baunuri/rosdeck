import type { WidgetDefinition } from '../../types/layout';
import { PointCloud3DWidget } from './PointCloud3DWidget';

export const pointCloud3DWidget: WidgetDefinition = {
  type: 'pointcloud3d',
  name: '3D Point Cloud',
  icon: 'cube-outline',
  category: 'sensor',
  supportedMessageTypes: ['sensor_msgs/msg/PointCloud2'],
  defaultConfig: {
    topic: '/points',
    fixedFrame: 'odom',
    robotFrame: 'base_link',
    accumulate: false,
    viewMeters: 20,
  },
  configSchema: [
    {
      key: 'topic',
      label: 'Point Cloud Topic',
      type: 'topic',
      topicMessageTypes: ['sensor_msgs/msg/PointCloud2'],
    },
    { key: 'fixedFrame', label: 'Fixed Frame', type: 'text', placeholder: 'odom' },
    { key: 'robotFrame', label: 'Robot Frame (view center)', type: 'text', placeholder: 'base_link' },
    { key: 'accumulate', label: 'Accumulate (build a map)', type: 'boolean' },
    { key: 'viewMeters', label: 'Default View Size (m)', type: 'number', placeholder: '20' },
  ],
  component: PointCloud3DWidget as any,
};
