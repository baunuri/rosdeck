import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'ros2mobile_settings';

interface SettingsState {
  hapticsEnabled: boolean;
  keepAwake: boolean;
  publishRateHz: number;
  autoDetectTopics: boolean;
  fieldPickerDepth: number;
  fieldPickerArrayLimit: number;
  loaded: boolean;
  load: () => Promise<void>;
  setHapticsEnabled: (value: boolean) => void;
  setKeepAwake: (value: boolean) => void;
  setPublishRateHz: (value: number) => void;
  setAutoDetectTopics: (value: boolean) => void;
  setFieldPickerDepth: (value: number) => void;
  setFieldPickerArrayLimit: (value: number) => void;
}

const defaults = {
  hapticsEnabled: true,
  keepAwake: true,
  publishRateHz: 10,
  autoDetectTopics: true,
  fieldPickerDepth: 8,
  fieldPickerArrayLimit: 32,
};

function persistAll(get: () => SettingsState) {
  const { loaded, load, ...fns } = get();
  const data: Record<string, any> = {};
  for (const [k, v] of Object.entries(fns)) {
    if (typeof v !== 'function') data[k] = v;
  }
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaults,
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEY);
      if (json) {
        const data = JSON.parse(json);
        const restored: Record<string, any> = {};
        for (const key of Object.keys(defaults)) {
          restored[key] = data[key] ?? (defaults as any)[key];
        }
        set({ ...restored, loaded: true });
        return;
      }
    } catch {}
    set({ loaded: true });
  },

  setHapticsEnabled: (value) => { set({ hapticsEnabled: value }); persistAll(get); },
  setKeepAwake: (value) => { set({ keepAwake: value }); persistAll(get); },
  setPublishRateHz: (value) => { set({ publishRateHz: value }); persistAll(get); },
  setAutoDetectTopics: (value) => { set({ autoDetectTopics: value }); persistAll(get); },
  setFieldPickerDepth: (value) => { set({ fieldPickerDepth: value }); persistAll(get); },
  setFieldPickerArrayLimit: (value) => { set({ fieldPickerArrayLimit: value }); persistAll(get); },
}));
