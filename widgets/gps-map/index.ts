import type { WidgetDefinition } from '../../types/layout';
import { GpsMapWidget } from './GpsMapWidget';

/** Robot GPS position on OpenStreetMap / satellite tiles (like Foxglove's Map panel). */
export const gpsMapWidget: WidgetDefinition = {
  type: 'gps-map',
  name: 'GPS Map',
  icon: 'earth-outline',
  category: 'nav',
  supportedMessageTypes: ['sensor_msgs/msg/NavSatFix'],
  defaultConfig: { topic: '/gps/fix', tiles: 'satellite' },
  configSchema: [
    { key: 'topic', label: 'GPS Topic', type: 'topic', topicMessageTypes: ['sensor_msgs/msg/NavSatFix'] },
    {
      key: 'tiles', label: 'Base Map', type: 'select',
      options: [{ label: 'Satellite', value: 'satellite' }, { label: 'Street', value: 'street' }],
    },
  ],
  component: GpsMapWidget as any,
};
