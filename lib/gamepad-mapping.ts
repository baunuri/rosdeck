import type { LayoutNode } from '../types/layout';

export interface JoystickWidgetInfo {
  nodeId: string;
  config: Record<string, any>;
}

export interface StickMapping {
  nodeId: string;
  config: Record<string, any>;
  /** Which physical stick drives the widget's X axis */
  xStick: 'left' | 'right' | 'none';
  /** Which physical stick drives the widget's Y axis */
  yStick: 'left' | 'right' | 'none';
}

/** Collect joystick widgets from layout tree in tree-traversal order */
export function collectJoystickWidgets(node: LayoutNode): JoystickWidgetInfo[] {
  if (node.type === 'widget') {
    return node.widgetType === 'joystick'
      ? [{ nodeId: node.id, config: node.config }]
      : [];
  }
  return [
    ...collectJoystickWidgets(node.children[0]),
    ...collectJoystickWidgets(node.children[1]),
  ];
}

/** Apply deadzone with rescaling. Min deadzone 0.05. */
export function applyDeadzone(value: number, deadzone: number): number {
  const dz = Math.max(0.05, deadzone);
  const abs = Math.abs(value);
  if (abs < dz) return 0;
  const rescaled = (abs - dz) / (1 - dz);
  return Math.sign(value) * rescaled;
}

/** Resolve auto/manual stick mappings for a list of joystick widgets */
export function resolveStickMappings(widgets: JoystickWidgetInfo[]): StickMapping[] {
  return widgets.map((w, i) => {
    const setting: string = w.config.gamepadStick ?? 'auto';

    if (setting === 'left') {
      return { ...w, xStick: 'left', yStick: 'left' };
    }
    if (setting === 'right') {
      return { ...w, xStick: 'right', yStick: 'right' };
    }
    if (setting === 'none') {
      return { ...w, xStick: 'none', yStick: 'none' };
    }

    // Auto mapping
    if (widgets.length === 1) {
      // Split-stick: left-X for widget X axis, right-Y for widget Y axis
      return { ...w, xStick: 'left', yStick: 'right' };
    }
    if (i === 0) return { ...w, xStick: 'left', yStick: 'left' };
    if (i === 1) return { ...w, xStick: 'right', yStick: 'right' };
    return { ...w, xStick: 'none', yStick: 'none' };
  });
}
