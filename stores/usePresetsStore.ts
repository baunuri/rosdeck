import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LayoutNode, SavedLayout } from '../types/layout';

const STORAGE_KEY = 'ros2mobile_global_presets';

interface PresetsState {
  presets: SavedLayout[];
  loaded: boolean;
  load: () => Promise<void>;
  savePreset: (name: string, tree: LayoutNode) => Promise<void>;
  removePreset: (id: string) => Promise<void>;
}

export const usePresetsStore = create<PresetsState>((set, get) => ({
  presets: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        set({ presets: JSON.parse(stored), loaded: true });
        return;
      }
    } catch {}
    set({ loaded: true });
  },

  savePreset: async (name: string, tree: LayoutNode) => {
    const preset: SavedLayout = { id: `preset_${Date.now()}`, name, tree };
    const presets = [...get().presets, preset];
    set({ presets });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  },

  removePreset: async (id: string) => {
    const presets = get().presets.filter((p) => p.id !== id);
    set({ presets });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  },
}));
