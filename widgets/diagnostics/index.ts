import type { WidgetDefinition } from '../../types/layout';
import { DiagnosticsWidget } from './DiagnosticsWidget';

export const diagnosticsWidget: WidgetDefinition = {
  type: 'diagnostics',
  name: 'Diagnostics',
  icon: 'pulse-outline',
  category: 'debug',
  supportedMessageTypes: ['diagnostic_msgs/msg/DiagnosticArray'],
  defaultConfig: { topic: '/diagnostics' },
  configSchema: [
    { key: 'topic', label: 'Diagnostics Topic', type: 'topic', topicMessageTypes: ['diagnostic_msgs/msg/DiagnosticArray'] },
  ],
  component: DiagnosticsWidget as any,
};
