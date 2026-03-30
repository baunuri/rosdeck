import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'ros2mobile_onboarding';

interface OnboardingStore {
  isFirstLaunch: boolean;
  hasUsedDemo: boolean;
  suggestedForUrls: string[];
  loadOnboarding: () => Promise<void>;
  setFirstLaunchDone: () => void;
  setHasUsedDemo: () => void;
  addSuggestedUrl: (url: string) => void;
  reset: () => void;
}

const initialState = {
  isFirstLaunch: true,
  hasUsedDemo: false,
  suggestedForUrls: [] as string[],
};

function persist(state: Partial<typeof initialState>) {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
}

export const useOnboardingStore = create<OnboardingStore>((set, get) => ({
  ...initialState,

  loadOnboarding: async () => {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEY);
      if (json) {
        const data = JSON.parse(json);
        set({
          isFirstLaunch: data.isFirstLaunch ?? true,
          hasUsedDemo: data.hasUsedDemo ?? false,
          suggestedForUrls: data.suggestedForUrls ?? [],
        });
      }
    } catch {}
  },

  setFirstLaunchDone: () => {
    set({ isFirstLaunch: false });
    const { isFirstLaunch, hasUsedDemo, suggestedForUrls } = { ...get(), isFirstLaunch: false };
    persist({ isFirstLaunch, hasUsedDemo, suggestedForUrls });
  },

  setHasUsedDemo: () => {
    set({ hasUsedDemo: true });
    const { isFirstLaunch, suggestedForUrls } = get();
    persist({ isFirstLaunch, hasUsedDemo: true, suggestedForUrls });
  },

  addSuggestedUrl: (url: string) => {
    const current = get().suggestedForUrls;
    if (current.includes(url)) return;
    const updated = [...current, url];
    set({ suggestedForUrls: updated });
    const { isFirstLaunch, hasUsedDemo } = get();
    persist({ isFirstLaunch, hasUsedDemo, suggestedForUrls: updated });
  },

  reset: () => set({ ...initialState }),
}));
