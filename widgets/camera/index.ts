import type { WidgetDefinition } from '../../types/layout';
import { CameraFeed } from '../../components/CameraFeed';
import { DEFAULTS } from '../../constants/defaults';

export const cameraWidget: WidgetDefinition = {
  type: 'camera',
  name: 'Camera',
  icon: 'videocam-outline',
  category: 'sensor',
  supportedMessageTypes: ['sensor_msgs/msg/CompressedImage'],
  defaultConfig: {
    topic: DEFAULTS.cameraTopic,
    source: 'transport',
    mjpegPort: DEFAULTS.mjpegPort,
    maxFps: 10,
  },
  configSchema: [
    {
      key: 'source',
      label: 'Source',
      type: 'select',
      options: [
        { label: 'MJPEG', value: 'mjpeg' },
        { label: 'Transport', value: 'transport' },
      ],
    },
    {
      key: 'topic',
      label: 'Camera Topic',
      type: 'topic',
      topicMessageTypes: ['sensor_msgs/msg/CompressedImage'],
      visibleWhen: { key: 'source', value: 'mjpeg' },
    },
    {
      key: 'topic',
      label: 'Compressed Image Topic',
      type: 'topic',
      topicMessageTypes: ['sensor_msgs/msg/CompressedImage'],
      visibleWhen: { key: 'source', value: 'transport' },
    },
    { key: 'mjpegPort', label: 'MJPEG Port', type: 'number', visibleWhen: { key: 'source', value: 'mjpeg' } },
    { key: 'maxFps', label: 'Max FPS', type: 'slider', min: 1, max: 30, step: 1, unit: 'fps', visibleWhen: { key: 'source', value: 'transport' } },
  ],
  component: CameraFeed as any,
};
