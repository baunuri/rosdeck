import type { WidgetDefinition } from '../types/layout';
import { joystickWidget } from './joystick';
import { cameraWidget } from './camera';
import { mapWidget } from './map';
// LaserScan is now handled by the Map widget
// import { laserScanWidget } from './laserscan';
import { imuWidget } from './imu';
import { topicViewerWidget } from './topic-viewer';
import { tfTreeWidget } from './tf-tree';
import { diagnosticsWidget } from './diagnostics';
import { rosoutWidget } from './rosout';
import { batteryWidget } from './battery';
import { chartWidget } from './chart';

export const WIDGET_REGISTRY: Record<string, WidgetDefinition> = {
  joystick: joystickWidget,
  camera: cameraWidget,
  map: mapWidget,
  // laserscan removed — map widget handles scan visualization
  imu: imuWidget,
  'topic-viewer': topicViewerWidget,
  'tf-tree': tfTreeWidget,
  diagnostics: diagnosticsWidget,
  rosout: rosoutWidget,
  battery: batteryWidget,
  chart: chartWidget,
};

export function getWidget(type: string): WidgetDefinition | undefined {
  return WIDGET_REGISTRY[type];
}

export const WIDGET_CATEGORIES = ['control', 'sensor', 'nav', 'debug'] as const;

export function getWidgetsByCategory(category: string): WidgetDefinition[] {
  return Object.values(WIDGET_REGISTRY).filter((w) => w.category === category);
}
