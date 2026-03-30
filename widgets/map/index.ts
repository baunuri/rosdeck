import type { WidgetDefinition } from '../../types/layout';
import { MapWidget } from './MapWidget';

export const mapWidget: WidgetDefinition = {
  type: 'map',
  name: 'Map',
  icon: 'map-outline',
  category: 'nav',
  supportedMessageTypes: ['nav_msgs/msg/OccupancyGrid', 'sensor_msgs/msg/LaserScan'],
  defaultConfig: {
    topic: '/map',
    scanTopic: '/scan',
    mapFrame: 'map',
    robotFrame: 'base_link',
    flipIndicator: false,
    enableNav2Goal: false,
    nav2GoalTopic: '/goal_pose',
    globalCostmapTopic: '',
    localCostmapTopic: '',
    costmapOpacity: 0.5,
    updateRate: 0,
  },
  configSchema: [
    {
      key: 'topic',
      label: 'Map Topic',
      type: 'topic',
      topicMessageTypes: ['nav_msgs/msg/OccupancyGrid'],
    },
    {
      key: 'scanTopic',
      label: 'LaserScan Topic',
      type: 'topic',
      topicMessageTypes: ['sensor_msgs/msg/LaserScan'],
    },
    { key: 'mapFrame', label: 'Map Frame', type: 'text', placeholder: 'map' },
    { key: 'robotFrame', label: 'Robot Frame', type: 'text', placeholder: 'base_link' },
    { key: 'flipIndicator', label: 'Flip Robot Indicator', type: 'boolean' },
    {
      key: 'globalCostmapTopic',
      label: 'Global Costmap Topic',
      type: 'topic',
      topicMessageTypes: ['nav_msgs/msg/OccupancyGrid'],
    },
    {
      key: 'localCostmapTopic',
      label: 'Local Costmap Topic',
      type: 'topic',
      topicMessageTypes: ['nav_msgs/msg/OccupancyGrid'],
    },
    {
      key: 'enableNav2Goal',
      label: 'Enable Nav2 Goal (long press)',
      type: 'boolean',
    },
    { key: 'nav2GoalTopic', label: 'Goal Topic', type: 'text' },
    {
      key: 'updateRate',
      label: 'Max Update Rate',
      type: 'select',
      options: [
        { label: 'Robot rate', value: 0 },
        { label: '30 Hz', value: 30 },
        { label: '20 Hz', value: 20 },
        { label: '10 Hz', value: 10 },
        { label: '5 Hz', value: 5 },
      ],
    },
  ],
  component: MapWidget as any,
};
