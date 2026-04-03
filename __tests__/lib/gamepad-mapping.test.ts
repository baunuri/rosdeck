import {
  collectJoystickWidgets,
  resolveStickMappings,
  applyDeadzone,
  type JoystickWidgetInfo,
  type StickMapping,
} from '../../lib/gamepad-mapping';
import type { LayoutNode } from '../../types/layout';

describe('applyDeadzone', () => {
  it('returns 0 for values within deadzone', () => {
    expect(applyDeadzone(0.04, 0.1)).toBe(0);
    expect(applyDeadzone(-0.09, 0.1)).toBe(0);
  });

  it('rescales values outside deadzone to 0-1 range', () => {
    expect(applyDeadzone(0.1, 0.1)).toBeCloseTo(0);
    expect(applyDeadzone(1.0, 0.1)).toBeCloseTo(1);
    expect(applyDeadzone(0.55, 0.1)).toBeCloseTo(0.5);
  });

  it('preserves sign', () => {
    expect(applyDeadzone(-0.55, 0.1)).toBeCloseTo(-0.5);
  });

  it('enforces minimum deadzone of 0.05', () => {
    expect(applyDeadzone(0.03, 0.0)).toBe(0);
  });
});

describe('collectJoystickWidgets', () => {
  it('finds joystick widgets in a flat layout', () => {
    const layout: LayoutNode = {
      type: 'widget', id: 'j1', widgetType: 'joystick',
      config: { topic: '/cmd_vel', xAxisGroup: 'angular', xAxisComponent: 'z', xAxisScale: 1, yAxisGroup: 'linear', yAxisComponent: 'x', yAxisScale: 0.5 },
    };
    const result = collectJoystickWidgets(layout);
    expect(result).toHaveLength(1);
    expect(result[0].nodeId).toBe('j1');
  });

  it('finds multiple joystick widgets in a split layout', () => {
    const layout: LayoutNode = {
      type: 'split', id: 's1', direction: 'horizontal', ratio: 0.5,
      children: [
        { type: 'widget', id: 'j1', widgetType: 'joystick', config: { topic: '/cmd_vel' } },
        { type: 'widget', id: 'j2', widgetType: 'joystick', config: { topic: '/cmd_vel2' } },
      ],
    };
    const result = collectJoystickWidgets(layout);
    expect(result).toHaveLength(2);
    expect(result[0].nodeId).toBe('j1');
    expect(result[1].nodeId).toBe('j2');
  });

  it('ignores non-joystick widgets', () => {
    const layout: LayoutNode = {
      type: 'split', id: 's1', direction: 'horizontal', ratio: 0.5,
      children: [
        { type: 'widget', id: 'c1', widgetType: 'camera', config: {} },
        { type: 'widget', id: 'j1', widgetType: 'joystick', config: { topic: '/cmd_vel' } },
      ],
    };
    const result = collectJoystickWidgets(layout);
    expect(result).toHaveLength(1);
  });
});

describe('resolveStickMappings', () => {
  const makeWidget = (id: string, gamepadStick?: string): JoystickWidgetInfo => ({
    nodeId: id,
    config: {
      topic: '/cmd_vel',
      xAxisGroup: 'angular', xAxisComponent: 'z', xAxisScale: 1,
      yAxisGroup: 'linear', yAxisComponent: 'x', yAxisScale: 0.5,
      gamepadStick: gamepadStick ?? 'auto',
    },
  });

  it('single widget auto: left-X drives x-axis, right-Y drives y-axis', () => {
    const mappings = resolveStickMappings([makeWidget('j1')]);
    expect(mappings).toHaveLength(1);
    expect(mappings[0].nodeId).toBe('j1');
    expect(mappings[0].xStick).toBe('left');
    expect(mappings[0].yStick).toBe('right');
  });

  it('two widgets auto: first=left, second=right', () => {
    const mappings = resolveStickMappings([makeWidget('j1'), makeWidget('j2')]);
    expect(mappings[0].xStick).toBe('left');
    expect(mappings[0].yStick).toBe('left');
    expect(mappings[1].xStick).toBe('right');
    expect(mappings[1].yStick).toBe('right');
  });

  it('three widgets auto: third gets none', () => {
    const mappings = resolveStickMappings([makeWidget('j1'), makeWidget('j2'), makeWidget('j3')]);
    expect(mappings[2].xStick).toBe('none');
    expect(mappings[2].yStick).toBe('none');
  });

  it('manual override: widget set to right', () => {
    const mappings = resolveStickMappings([makeWidget('j1', 'right')]);
    expect(mappings[0].xStick).toBe('right');
    expect(mappings[0].yStick).toBe('right');
  });

  it('manual override: widget set to none', () => {
    const mappings = resolveStickMappings([makeWidget('j1', 'none')]);
    expect(mappings[0].xStick).toBe('none');
    expect(mappings[0].yStick).toBe('none');
  });
});
