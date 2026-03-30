import type { WidgetDefinition } from '../../types/layout';
import { BatteryWidget } from './BatteryWidget';

export const batteryWidget: WidgetDefinition = {
  type: 'battery',
  name: 'Battery',
  icon: 'battery-half-outline',
  category: 'sensor',
  supportedMessageTypes: ['sensor_msgs/msg/BatteryState'],
  defaultConfig: { topic: '/battery_state' },
  configSchema: [
    { key: 'topic', label: 'Battery Topic', type: 'topic', topicMessageTypes: ['sensor_msgs/msg/BatteryState'] },
  ],
  component: BatteryWidget as any,
};
