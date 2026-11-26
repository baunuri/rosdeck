import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Own key, not in ros2mobile_settings: resetting settings or app data shouldn't take back a tip's thank-you.
const STORAGE_KEY = 'ros2mobile_supporter';

/** Supporter accent (joystick knob, badge, tip buttons). */
export const GOLD = '#FBBF24';

interface SupporterState {
  /** Owns any tip; unlocks the gold joystick and the badge. Cached here, confirmed from Play at launch. */
  supporter: boolean;
  load: () => Promise<void>;
  setSupporter: (value: boolean) => void;
}

export const useSupporterStore = create<SupporterState>((set) => ({
  supporter: false,
  load: async () => {
    try {
      if ((await AsyncStorage.getItem(STORAGE_KEY)) === '1') set({ supporter: true });
    } catch {}
  },
  setSupporter: (value) => {
    set({ supporter: value });
    AsyncStorage.setItem(STORAGE_KEY, value ? '1' : '0').catch(() => {});
  },
}));
