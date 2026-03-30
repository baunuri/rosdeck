import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type LayoutNode,
  type SavedLayout,
  createWidgetNode,
  createSplitNode,
  findNode,
  replaceNode,
  removeNode,
} from '../types/layout';
import { buildDefaultLayouts } from '../constants/presets';
import { getWidget } from '../widgets/registry';

const STORAGE_KEY_PREFIX = 'ros2mobile_layouts_';

interface LayoutState {
  robotUrl: string | null;
  layouts: SavedLayout[];
  activeLayoutId: string;
  editMode: boolean;

  initForRobot: (url: string) => Promise<void>;
  setActiveLayout: (id: string) => void;
  getActiveLayout: () => SavedLayout | undefined;
  updateLayoutTree: (tree: LayoutNode) => void;
  addLayout: (name: string, tree: LayoutNode) => void;
  removeLayout: (id: string) => void;
  renameLayout: (id: string, name: string) => void;
  setEditMode: (editing: boolean) => void;
  splitPane: (nodeId: string, direction: 'horizontal' | 'vertical', widgetType: string) => void;
  removePane: (nodeId: string) => void;
  updateWidgetConfig: (nodeId: string, config: Record<string, any>) => void;
  swapWidget: (nodeId: string, widgetType: string) => void;
  swapChildren: (splitNodeId: string) => void;
  updateSplitRatio: (nodeId: string, ratio: number) => void;
  persist: () => Promise<void>;
  reset: () => void;
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  robotUrl: null,
  layouts: [],
  activeLayoutId: '',
  editMode: false,

  initForRobot: async (url: string) => {
    const key = STORAGE_KEY_PREFIX + url;
    try {
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        const data = JSON.parse(stored);
        set({ robotUrl: url, layouts: data.layouts, activeLayoutId: data.activeLayoutId });
        return;
      }
    } catch {}
    const layouts = buildDefaultLayouts();
    const defaultLayoutId = url.startsWith('demo://') ? 'dashboard' : 'drive-camera';
    set({ robotUrl: url, layouts, activeLayoutId: defaultLayoutId });
    get().persist();
  },

  setActiveLayout: (id: string) => {
    set({ activeLayoutId: id });
    get().persist();
  },

  getActiveLayout: () => {
    const { layouts, activeLayoutId } = get();
    return layouts.find((l) => l.id === activeLayoutId);
  },

  updateLayoutTree: (tree: LayoutNode) => {
    const { activeLayoutId } = get();
    set((state) => ({
      layouts: state.layouts.map((l) =>
        l.id === activeLayoutId ? { ...l, tree } : l
      ),
    }));
    get().persist();
  },

  addLayout: (name: string, tree: LayoutNode) => {
    const id = `custom_${Date.now()}`;
    set((state) => ({
      layouts: [...state.layouts, { id, name, tree }],
      activeLayoutId: id,
    }));
    get().persist();
  },

  removeLayout: (id: string) => {
    const { layouts, activeLayoutId } = get();
    const filtered = layouts.filter((l) => l.id !== id);
    const newActive = id === activeLayoutId
      ? (filtered[0]?.id || '')
      : activeLayoutId;
    set({ layouts: filtered, activeLayoutId: newActive });
    get().persist();
  },

  renameLayout: (id: string, name: string) => {
    set((state) => ({
      layouts: state.layouts.map((l) =>
        l.id === id ? { ...l, name } : l
      ),
    }));
    get().persist();
  },

  setEditMode: (editing: boolean) => set({ editMode: editing }),

  splitPane: (nodeId: string, direction: 'horizontal' | 'vertical', widgetType: string) => {
    const layout = get().getActiveLayout();
    if (!layout) return;
    const origNode = findNode(layout.tree, nodeId);
    if (!origNode) return;
    const widget = getWidget(widgetType);
    const newWidget = createWidgetNode(widgetType, widget?.defaultConfig || {});
    const splitNode = createSplitNode(direction, origNode, newWidget);
    const updatedTree = replaceNode(layout.tree, nodeId, splitNode);
    get().updateLayoutTree(updatedTree);
  },

  removePane: (nodeId: string) => {
    const layout = get().getActiveLayout();
    if (!layout) return;
    const newTree = removeNode(layout.tree, nodeId);
    if (newTree) {
      get().updateLayoutTree(newTree);
    }
  },

  updateWidgetConfig: (nodeId: string, config: Record<string, any>) => {
    const layout = get().getActiveLayout();
    if (!layout) return;
    const updateConfig = (node: LayoutNode): LayoutNode => {
      if (node.id === nodeId && node.type === 'widget') {
        return { ...node, config };
      }
      if (node.type === 'split') {
        return { ...node, children: [updateConfig(node.children[0]), updateConfig(node.children[1])] };
      }
      return node;
    };
    get().updateLayoutTree(updateConfig(layout.tree));
  },

  swapWidget: (nodeId: string, widgetType: string) => {
    const layout = get().getActiveLayout();
    if (!layout) return;
    const widget = getWidget(widgetType);
    const newNode = createWidgetNode(widgetType, widget?.defaultConfig || {});
    const updatedTree = replaceNode(layout.tree, nodeId, newNode);
    get().updateLayoutTree(updatedTree);
  },

  swapChildren: (splitNodeId: string) => {
    const layout = get().getActiveLayout();
    if (!layout) return;
    const swap = (node: LayoutNode): LayoutNode => {
      if (node.id === splitNodeId && node.type === 'split') {
        return { ...node, ratio: 1 - node.ratio, children: [node.children[1], node.children[0]] };
      }
      if (node.type === 'split') {
        return { ...node, children: [swap(node.children[0]), swap(node.children[1])] };
      }
      return node;
    };
    get().updateLayoutTree(swap(layout.tree));
  },

  updateSplitRatio: (nodeId: string, ratio: number) => {
    const layout = get().getActiveLayout();
    if (!layout) return;
    const updateRatio = (node: LayoutNode): LayoutNode => {
      if (node.id === nodeId && node.type === 'split') {
        return { ...node, ratio };
      }
      if (node.type === 'split') {
        return {
          ...node,
          children: [updateRatio(node.children[0]), updateRatio(node.children[1])],
        };
      }
      return node;
    };
    get().updateLayoutTree(updateRatio(layout.tree));
  },

  persist: async () => {
    const { robotUrl, layouts, activeLayoutId } = get();
    if (!robotUrl) return;
    const key = STORAGE_KEY_PREFIX + robotUrl;
    await AsyncStorage.setItem(key, JSON.stringify({ layouts, activeLayoutId }));
  },

  reset: () => set({ robotUrl: null, layouts: [], activeLayoutId: '', editMode: false }),
}));
