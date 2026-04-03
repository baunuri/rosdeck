import type React from 'react';

let _idCounter = 0;

export function generateId(): string {
  return `node_${Date.now()}_${_idCounter++}`;
}

export interface WidgetNode {
  type: 'widget';
  id: string;
  widgetType: string;
  config: Record<string, any>;
}

export interface SplitNode {
  type: 'split';
  id: string;
  direction: 'horizontal' | 'vertical';
  ratio: number;
  children: [LayoutNode, LayoutNode];
}

export type LayoutNode = SplitNode | WidgetNode;

export interface WidgetProps {
  nodeId?: string;
  config: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
  width: number;
  height: number;
}

export interface WidgetConfigField {
  key: string;
  label: string;
  type: 'topic' | 'text' | 'number' | 'boolean' | 'select' | 'series-editor' | 'axis-mapping' | 'slider';
  topicMessageTypes?: string[];
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
  /** Slider config */
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Only show this field when config[key] === value */
  visibleWhen?: { key: string; value: any };
}

export interface WidgetDefinition {
  type: string;
  name: string;
  icon: string;
  category: 'control' | 'sensor' | 'nav' | 'debug';
  supportedMessageTypes: string[];
  defaultConfig: Record<string, any>;
  configSchema?: WidgetConfigField[];
  component: React.ComponentType<WidgetProps>;
}

export interface SavedLayout {
  id: string;
  name: string;
  tree: LayoutNode;
}

export interface RobotProfile {
  url: string;
  name?: string;
  transport: 'rosbridge' | 'foxglove';
  layouts: SavedLayout[];
  activeLayoutId: string;
  settings: {
    cmdVelTopic: string;
    cameraTopic: string;
    maxLinearVel: number;
    maxAngularVel: number;
    useTwistStamped: boolean;
    frameId: string;
    cameraSource: 'mjpeg' | 'rosbridge';
    mjpegPort: number;
  };
  lastUsed: number;
}

export function createWidgetNode(widgetType: string, config: Record<string, any>): WidgetNode {
  return { type: 'widget', id: generateId(), widgetType, config };
}

export function createSplitNode(
  direction: 'horizontal' | 'vertical',
  first: LayoutNode,
  second: LayoutNode,
  ratio: number = 0.5
): SplitNode {
  return { type: 'split', id: generateId(), direction, ratio, children: [first, second] };
}

export function findNode(root: LayoutNode, id: string): LayoutNode | undefined {
  if (root.id === id) return root;
  if (root.type === 'split') {
    return findNode(root.children[0], id) || findNode(root.children[1], id);
  }
  return undefined;
}

export function replaceNode(root: LayoutNode, id: string, replacement: LayoutNode): LayoutNode {
  if (root.id === id) return replacement;
  if (root.type === 'split') {
    return {
      ...root,
      children: [
        replaceNode(root.children[0], id, replacement),
        replaceNode(root.children[1], id, replacement),
      ],
    };
  }
  return root;
}

export function removeNode(root: LayoutNode, id: string): LayoutNode | null {
  if (root.id === id) return null;
  if (root.type === 'split') {
    if (root.children[0].id === id) return root.children[1];
    if (root.children[1].id === id) return root.children[0];
    const left = removeNode(root.children[0], id);
    if (left !== root.children[0]) {
      return left === null
        ? root.children[1]
        : { ...root, children: [left, root.children[1]] };
    }
    const right = removeNode(root.children[1], id);
    if (right !== root.children[1]) {
      return right === null
        ? root.children[0]
        : { ...root, children: [root.children[0], right] };
    }
  }
  return root;
}
