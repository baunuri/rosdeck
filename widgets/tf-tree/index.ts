import type { WidgetDefinition } from '../../types/layout';
import { TfTreeWidget } from './TfTreeWidget';

export const tfTreeWidget: WidgetDefinition = {
  type: 'tf-tree',
  name: 'TF Tree',
  icon: 'git-branch-outline',
  category: 'debug',
  supportedMessageTypes: ['tf2_msgs/msg/TFMessage'],
  defaultConfig: {},
  configSchema: [],
  component: TfTreeWidget as any,
};
