import type { WidgetDefinition } from '../../types/layout';
import { LaserScanWidget } from './LaserScanWidget';

export const laserScanWidget: WidgetDefinition = {
  type: 'laserscan',
  name: 'LaserScan',
  icon: 'radio-outline',
  category: 'sensor',
  supportedMessageTypes: ['sensor_msgs/msg/LaserScan'],
  defaultConfig: { topic: '/scan', maxRange: 10, pointColor: '#4A9EFF' },
  configSchema: [
    { key: 'topic', label: 'LaserScan Topic', type: 'topic', topicMessageTypes: ['sensor_msgs/msg/LaserScan'] },
    { key: 'maxRange', label: 'Max Range (m)', type: 'number' },
  ],
  component: LaserScanWidget as any,
};
