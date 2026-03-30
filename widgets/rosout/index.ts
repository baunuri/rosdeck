import type { WidgetDefinition } from '../../types/layout';
import { RosoutWidget } from './RosoutWidget';

export const rosoutWidget: WidgetDefinition = {
  type: 'rosout',
  name: 'Rosout',
  icon: 'terminal-outline',
  category: 'debug',
  supportedMessageTypes: ['rcl_interfaces/msg/Log'],
  defaultConfig: { topic: '/rosout', minLevel: 20 },
  configSchema: [
    { key: 'topic', label: 'Log Topic', type: 'topic', topicMessageTypes: ['rcl_interfaces/msg/Log'] },
    { key: 'minLevel', label: 'Min Level', type: 'select', options: [
      { label: 'DEBUG', value: '10' },
      { label: 'INFO', value: '20' },
      { label: 'WARN', value: '30' },
      { label: 'ERROR', value: '40' },
    ]},
  ],
  component: RosoutWidget as any,
};
