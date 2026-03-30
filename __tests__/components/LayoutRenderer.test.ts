jest.mock('react-native', () => ({
  View: 'View',
  StyleSheet: { create: (s: Record<string, unknown>) => s },
}));

jest.mock('react-native-gesture-handler', () => ({
  Gesture: { Pan: () => ({ enabled: jest.fn().mockReturnThis(), onStart: jest.fn().mockReturnThis(), onUpdate: jest.fn().mockReturnThis(), onEnd: jest.fn().mockReturnThis() }) },
  GestureDetector: 'GestureDetector',
}));

jest.mock('react-native-reanimated', () => {
  const chainable: any = new Proxy({}, { get: () => () => chainable });
  const Animated: any = {
    View: 'Animated.View',
    Text: 'Animated.Text',
    createAnimatedComponent: (c: any) => c,
  };
  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    useSharedValue: (v: any) => ({ value: v }),
    useAnimatedStyle: (fn: Function) => fn(),
    withTiming: (v: any) => v,
    withSpring: (v: any) => v,
    runOnJS: (fn: Function) => fn,
    FadeIn: chainable,
    FadeOut: chainable,
  };
});

jest.mock('../../stores/useLayoutStore', () => ({
  useLayoutStore: Object.assign(() => ({}), { getState: () => ({ getActiveLayout: () => null }) }),
}));

jest.mock('../../widgets/registry', () => ({
  getWidget: () => null,
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { resolveLayout } from '../../components/LayoutRenderer';
import { createWidgetNode, createSplitNode } from '../../types/layout';

describe('resolveLayout', () => {
  it('returns a single widget for a leaf node', () => {
    const node = createWidgetNode('camera', {});
    const result = resolveLayout(node, 300, 500);
    expect(result).toEqual({
      type: 'widget',
      widgetType: 'camera',
      config: {},
      nodeId: node.id,
      x: 0, y: 0, width: 300, height: 500,
    });
  });

  it('splits space vertically', () => {
    const node = createSplitNode('vertical',
      createWidgetNode('camera', {}),
      createWidgetNode('joystick', {}),
      0.6
    );
    const result = resolveLayout(node, 300, 500);
    expect(result.type).toBe('split');
    if (result.type === 'split') {
      expect(result.first.height).toBe(300); // 500 * 0.6
      expect(result.second.height).toBe(200); // 500 * 0.4
      expect(result.first.width).toBe(300);
      expect(result.second.width).toBe(300);
    }
  });

  it('splits space horizontally', () => {
    const node = createSplitNode('horizontal',
      createWidgetNode('camera', {}),
      createWidgetNode('joystick', {}),
      0.5
    );
    const result = resolveLayout(node, 400, 300);
    expect(result.type).toBe('split');
    if (result.type === 'split') {
      expect(result.first.width).toBe(200);
      expect(result.second.width).toBe(200);
      expect(result.first.height).toBe(300);
    }
  });
});
