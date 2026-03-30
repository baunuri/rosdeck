// widgets/imu/index.ts
import type { WidgetDefinition } from '../../types/layout';
import { ImuWidget } from './ImuWidget';

export const imuWidget: WidgetDefinition = {
  type: 'imu',
  name: 'IMU / Orientation',
  icon: 'compass-outline',
  category: 'sensor',
  supportedMessageTypes: [
    'sensor_msgs/msg/Imu',
    'sensor_msgs/msg/MagneticField',
  ],
  defaultConfig: {
    topic: '/imu/data',
    imuHasCompass: false,
    magTopic: '',
    displayMode: 'attitude',
    updateRate: '10',
  },
  configSchema: [
    {
      key: 'topic',
      label: 'IMU Topic',
      type: 'topic',
      topicMessageTypes: ['sensor_msgs/msg/Imu'],
    },
    {
      key: 'imuHasCompass',
      label: '9-Axis IMU (includes compass)',
      type: 'boolean',
    },
    {
      key: 'magTopic',
      label: 'Magnetometer Topic',
      type: 'topic',
      topicMessageTypes: ['sensor_msgs/msg/MagneticField'],
      visibleWhen: { key: 'imuHasCompass', value: false },
    },
    {
      key: 'displayMode',
      label: 'Display Mode',
      type: 'select',
      options: [
        { label: 'Attitude Indicator', value: 'attitude' },
        { label: 'Data Readout', value: 'data' },
      ],
    },
    {
      key: 'updateRate',
      label: 'Update Rate',
      type: 'select',
      options: [
        { label: '5 Hz', value: '5' },
        { label: '10 Hz', value: '10' },
        { label: '20 Hz', value: '20' },
        { label: '30 Hz', value: '30' },
      ],
    },
  ],
  component: ImuWidget as any,
};
