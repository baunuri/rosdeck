import { useGamepadStore } from '../../stores/useGamepadStore';

describe('useGamepadStore', () => {
  beforeEach(() => {
    useGamepadStore.setState({
      connected: false,
      controllerName: '',
      resolvedMappings: {},
    });
  });

  it('starts disconnected', () => {
    const state = useGamepadStore.getState();
    expect(state.connected).toBe(false);
    expect(state.controllerName).toBe('');
  });

  it('setConnected updates state', () => {
    useGamepadStore.getState().setConnected(true, 'Xbox Controller');
    const state = useGamepadStore.getState();
    expect(state.connected).toBe(true);
    expect(state.controllerName).toBe('Xbox Controller');
  });

  it('setConnected to false clears name', () => {
    useGamepadStore.getState().setConnected(true, 'PS5');
    useGamepadStore.getState().setConnected(false, '');
    const state = useGamepadStore.getState();
    expect(state.connected).toBe(false);
    expect(state.controllerName).toBe('');
  });
});
