import { useOnboardingStore } from '../../stores/useOnboardingStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  useOnboardingStore.getState().reset();
  jest.clearAllMocks();
});

describe('useOnboardingStore', () => {
  it('starts with default flags', () => {
    const state = useOnboardingStore.getState();
    expect(state.isFirstLaunch).toBe(true);
    expect(state.hasUsedDemo).toBe(false);
    expect(state.suggestedForUrls).toEqual([]);
  });

  it('setFirstLaunchDone updates flag and persists', () => {
    useOnboardingStore.getState().setFirstLaunchDone();
    expect(useOnboardingStore.getState().isFirstLaunch).toBe(false);
    expect(AsyncStorage.setItem).toHaveBeenCalled();
  });

  it('setHasUsedDemo updates flag and persists', () => {
    useOnboardingStore.getState().setHasUsedDemo();
    expect(useOnboardingStore.getState().hasUsedDemo).toBe(true);
    expect(AsyncStorage.setItem).toHaveBeenCalled();
  });

  it('addSuggestedUrl appends URL and persists', () => {
    useOnboardingStore.getState().addSuggestedUrl('ws://192.168.1.50:8765');
    expect(useOnboardingStore.getState().suggestedForUrls).toContain('ws://192.168.1.50:8765');
    expect(AsyncStorage.setItem).toHaveBeenCalled();
  });

  it('addSuggestedUrl does not duplicate URLs', () => {
    const store = useOnboardingStore.getState();
    store.addSuggestedUrl('ws://192.168.1.50:8765');
    store.addSuggestedUrl('ws://192.168.1.50:8765');
    expect(useOnboardingStore.getState().suggestedForUrls).toHaveLength(1);
  });

  it('loadOnboarding restores persisted state', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({ isFirstLaunch: false, hasUsedDemo: true, suggestedForUrls: ['ws://test'] })
    );
    await useOnboardingStore.getState().loadOnboarding();
    const state = useOnboardingStore.getState();
    expect(state.isFirstLaunch).toBe(false);
    expect(state.hasUsedDemo).toBe(true);
    expect(state.suggestedForUrls).toEqual(['ws://test']);
  });

  it('loadOnboarding handles missing data gracefully', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    await useOnboardingStore.getState().loadOnboarding();
    expect(useOnboardingStore.getState().isFirstLaunch).toBe(true);
  });
});
