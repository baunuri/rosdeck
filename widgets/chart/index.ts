import type { WidgetDefinition } from '../../types/layout';
import { ChartWidget } from './ChartWidget';

export const chartWidget: WidgetDefinition = {
  type: 'chart',
  name: 'Line Chart',
  icon: 'analytics-outline',
  category: 'sensor',
  supportedMessageTypes: [],
  defaultConfig: {
    series: [],
    windowSec: 30,
  },
  configSchema: [
    { key: 'series', label: 'Series', type: 'series-editor' },
    { key: 'windowSec', label: 'Window (sec)', type: 'number' },
    { key: 'yMin', label: 'Y Min (auto if empty)', type: 'number' },
    { key: 'yMax', label: 'Y Max (auto if empty)', type: 'number' },
  ],
  component: ChartWidget as any,
};
