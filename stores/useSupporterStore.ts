import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Own key, not in ros2mobile_settings: resetting settings or app data shouldn't take back a tip's thank-you.
const STORAGE_KEY = 'ros2mobile_supporter';

/** Supporter accent (joystick knob, badge, tip buttons). */
export const GOLD = '#FBBF24';

interface SupporterState {
  /** Set after any tip; unlocks the gold joystick and the badge. */
  supporter: boolean;
  load: () => Promise<void>;
  markSupporter: () => void;
}

// ponytail: device-local flag; a reinstall forgets it (consumed tips aren't queryable). Fine for an easter egg.
export const useSupporterStore = create<SupporterState>((set) => ({
  supporter: false,
  load: async () => {
    try {
      if ((await AsyncStorage.getItem(STORAGE_KEY)) === '1') set({ supporter: true });
    } catch {}
  },
  markSupporter: () => {
    set({ supporter: true });
    AsyncStorage.setItem(STORAGE_KEY, '1').catch(() => {});
  },
}));
