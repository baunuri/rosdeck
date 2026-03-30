import { useRosStore } from '../../stores/useRosStore';

// Reset store between tests
beforeEach(() => {
  useRosStore.getState().reset();
});

describe('useRosStore', () => {
  describe('connection state', () => {
    it('starts disconnected with no URL', () => {
      const state = useRosStore.getState();
      expect(state.connection.status).toBe('disconnected');
      expect(state.connection.url).toBe('');
      expect(state.connection.ros).toBeNull();
      expect(state.connection.error).toBeNull();
    });

    it('setUrl updates the URL', () => {
      useRosStore.getState().setUrl('ws://192.168.1.50:9090');
      expect(useRosStore.getState().connection.url).toBe('ws://192.168.1.50:9090');
    });

    it('setConnectionStatus updates status and clears error on connect', () => {
      useRosStore.getState().setConnectionStatus('connected');
      const state = useRosStore.getState();
      expect(state.connection.status).toBe('connected');
      expect(state.connection.error).toBeNull();
    });

    it('setConnectionStatus sets error message on error', () => {
      useRosStore.getState().setConnectionStatus('error', 'Connection refused');
      const state = useRosStore.getState();
      expect(state.connection.status).toBe('error');
      expect(state.connection.error).toBe('Connection refused');
    });
  });

  describe('transport state', () => {
    it('starts with null transport and rosbridge type', () => {
      const state = useRosStore.getState();
      expect(state.transport).toBeNull();
      expect(state.transportType).toBe('rosbridge');
    });

    it('setTransportType updates the transport type', () => {
      useRosStore.getState().setTransportType('foxglove');
      expect(useRosStore.getState().transportType).toBe('foxglove');
    });

    it('reset restores transport state', () => {
      useRosStore.getState().setTransportType('foxglove');
      useRosStore.getState().reset();
      const state = useRosStore.getState();
      expect(state.transport).toBeNull();
      expect(state.transportType).toBe('rosbridge');
    });
  });

  describe('saved connections', () => {
    it('starts with empty saved connections', () => {
      expect(useRosStore.getState().savedConnections).toEqual([]);
    });

    it('addSavedConnection adds a new connection', () => {
      useRosStore.getState().addSavedConnection('ws://192.168.1.50:9090', 'TurtleBot');
      const saved = useRosStore.getState().savedConnections;
      expect(saved).toHaveLength(1);
      expect(saved[0].url).toBe('ws://192.168.1.50:9090');
      expect(saved[0].name).toBe('TurtleBot');
    });

    it('addSavedConnection updates lastUsed if URL exists', () => {
      useRosStore.getState().addSavedConnection('ws://192.168.1.50:9090', 'TurtleBot');
      const firstTime = useRosStore.getState().savedConnections[0].lastUsed;
      useRosStore.getState().addSavedConnection('ws://192.168.1.50:9090');
      const saved = useRosStore.getState().savedConnections;
      expect(saved).toHaveLength(1);
      expect(saved[0].lastUsed).toBeGreaterThanOrEqual(firstTime);
    });

    it('removeSavedConnection removes by URL', () => {
      useRosStore.getState().addSavedConnection('ws://192.168.1.50:9090');
      useRosStore.getState().addSavedConnection('ws://10.0.0.1:9090');
      useRosStore.getState().removeSavedConnection('ws://192.168.1.50:9090');
      const saved = useRosStore.getState().savedConnections;
      expect(saved).toHaveLength(1);
      expect(saved[0].url).toBe('ws://10.0.0.1:9090');
    });
  });

  describe('getTopics', () => {
    it('returns empty array when no transport', async () => {
      const topics = await useRosStore.getState().getTopics();
      expect(topics).toEqual([]);
    });
  });
});
