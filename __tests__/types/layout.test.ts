import {
  createWidgetNode,
  createSplitNode,
  findNode,
  replaceNode,
  removeNode,
  generateId,
} from '../../types/layout';

describe('createWidgetNode', () => {
  it('creates a widget node with id and type', () => {
    const node = createWidgetNode('camera', { topic: '/cam' });
    expect(node.type).toBe('widget');
    expect(node.widgetType).toBe('camera');
    expect(node.config).toEqual({ topic: '/cam' });
    expect(node.id).toBeDefined();
  });
});

describe('createSplitNode', () => {
  it('creates a split node with two children', () => {
    const a = createWidgetNode('camera', {});
    const b = createWidgetNode('joystick', {});
    const split = createSplitNode('vertical', a, b, 0.6);
    expect(split.type).toBe('split');
    expect(split.direction).toBe('vertical');
    expect(split.ratio).toBe(0.6);
    expect(split.children).toHaveLength(2);
  });
});

describe('findNode', () => {
  it('finds a node by id in a nested tree', () => {
    const leaf = createWidgetNode('camera', {});
    const root = createSplitNode('vertical',
      leaf,
      createWidgetNode('joystick', {})
    );
    expect(findNode(root, leaf.id)).toBe(leaf);
  });

  it('returns undefined for missing id', () => {
    const root = createWidgetNode('camera', {});
    expect(findNode(root, 'nonexistent')).toBeUndefined();
  });
});

describe('replaceNode', () => {
  it('replaces a leaf with a new subtree', () => {
    const leaf = createWidgetNode('camera', {});
    const root = createSplitNode('vertical',
      leaf,
      createWidgetNode('joystick', {})
    );
    const replacement = createWidgetNode('map', {});
    const newRoot = replaceNode(root, leaf.id, replacement);
    expect(findNode(newRoot, replacement.id)).toBe(replacement);
    expect(findNode(newRoot, leaf.id)).toBeUndefined();
  });
});

describe('removeNode', () => {
  it('removes a node and promotes its sibling', () => {
    const camera = createWidgetNode('camera', {});
    const joystick = createWidgetNode('joystick', {});
    const root = createSplitNode('vertical', camera, joystick);
    const newRoot = removeNode(root, camera.id);
    expect(newRoot).toBe(joystick);
  });

  it('returns null when removing the only node', () => {
    const root = createWidgetNode('camera', {});
    expect(removeNode(root, root.id)).toBeNull();
  });
});
