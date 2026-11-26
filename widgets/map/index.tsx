import React from 'react';
import type { WidgetDefinition, WidgetProps } from '../../types/layout';
import { view3dWidget } from '../view3d';
import { View3DWidget } from '../view3d/View3DWidget';

/**
 * The old 2D map widget saved different keys; map them onto the 3D View's so saved
 * layouts keep working. Keys already in the new format win.
 */
export function fromLegacyMapConfig(config: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { topDown: true, ...config };
  const legacy: Array<[string, string]> = [
    ['topic', 'mapTopic'], ['mapFrame', 'fixedFrame'], ['enableNav2Goal', 'enableGoal'], ['nav2GoalTopic', 'goalTopic'],
  ];
  for (const [oldKey, newKey] of legacy) {
    if (oldKey in config && !(newKey in config)) out[newKey] = config[oldKey];
  }
  return out;
}

function MapWidget(props: Partial<WidgetProps>) {
  return <View3DWidget {...props} config={fromLegacyMapConfig(props.config ?? {})} />;
}

/** "Map" is the 3D View starting top-down (like RViz's TopDownOrtho view). */
export const mapWidget: WidgetDefinition = {
  ...view3dWidget,
  type: 'map',
  name: 'Map',
  icon: 'map-outline',
  defaultConfig: { ...view3dWidget.defaultConfig, topDown: true },
  component: MapWidget as any,
};
