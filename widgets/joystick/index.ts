import type { WidgetDefinition } from '../../types/layout';
import { Joystick } from '../../components/Joystick';
import { DEFAULTS } from '../../constants/defaults';

export const joystickWidget: WidgetDefinition = {
  type: 'joystick',
  name: 'Joystick',
  icon: 'game-controller-outline',
  category: 'control',
  supportedMessageTypes: [],
  defaultConfig: {
    topic: DEFAULTS.cmdVelTopic,
    useTwistStamped: true,
    frameId: 'base_link',
    xAxisGroup: 'angular',
    xAxisComponent: 'z',
    xAxisScale: 1.0,
    yAxisGroup: 'linear',
    yAxisComponent: 'x',
    yAxisScale: 0.5,
  },
  configSchema: [
    { key: 'topic', label: 'cmd_vel Topic', type: 'text' },
    { key: 'useTwistStamped', label: 'Use TwistStamped (Jazzy+)', type: 'boolean' },
    { key: 'frameId', label: 'Frame ID', type: 'text' },
    { key: 'axisMapping', label: 'Axis Mapping', type: 'axis-mapping' },
  ],
  component: Joystick as any,
};
