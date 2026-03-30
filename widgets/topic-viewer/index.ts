import type { WidgetDefinition } from '../../types/layout';
import { TopicViewerWidget } from './TopicViewerWidget';

export const topicViewerWidget: WidgetDefinition = {
  type: 'topic-viewer',
  name: 'Topic Viewer',
  icon: 'code-slash-outline',
  category: 'debug',
  supportedMessageTypes: [],
  defaultConfig: { topic: '', messageType: '', showHistory: false },
  configSchema: [
    { key: 'topic', label: 'Topic', type: 'topic' },
    { key: 'showHistory', label: 'Show Message History', type: 'boolean' },
  ],
  component: TopicViewerWidget as any,
};
