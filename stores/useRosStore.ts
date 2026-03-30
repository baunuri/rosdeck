import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ConnectionStatus, SavedConnection } from '../types/ros';
import type { Transport, TransportType } from '../lib/transport';
import { RosbridgeTransport } from '../lib/rosbridge-transport';
import { FoxgloveTransport } from '../lib/foxglove-transport';
import { DemoTransport } from '../lib/demo-transport';
import { DEFAULTS } from '../constants/defaults';

interface ConnectionState {
  url: string;
  status: ConnectionStatus;
  error: string | null;
  ros: any;
}

interface RosStore {
  connection: ConnectionState;
  transport: Transport | null;
  transportType: TransportType;
  savedConnections: SavedConnection[];
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  setUrl: (url: string) => void;
  setConnectionStatus: (status: ConnectionStatus, error?: string) => void;
  setRos: (ros: any) => void;
  setTransportType: (type: TransportType) => void;
  getTopics: () => Promise<Array<{ name: string; type: string }>>;
  addSavedConnection: (url: string, name?: string) => void;
  removeSavedConnection: (url: string) => void;
  loadSavedConnections: () => Promise<void>;
  persistSavedConnections: () => Promise<void>;
  connectToUrl: (url: string) => void;
  handleDisconnect: () => void;
  disconnect: () => void;
  reset: () => void;
}

const initialConnection: ConnectionState = {
  url: '',
  status: 'disconnected',
  error: null,
  ros: null,
};

const STORAGE_KEY_CONNECTIONS = 'ros2mobile_saved_connections';

export const useRosStore = create<RosStore>((set, get) => ({
  connection: { ...initialConnection },
  transport: null,
  transportType: 'rosbridge',
  savedConnections: [],
  reconnectAttempts: 0,
  reconnectTimer: null,

  setUrl: (url) =>
    set((state) => ({ connection: { ...state.connection, url } })),

  setConnectionStatus: (status, error) =>
    set((state) => ({
      connection: {
        ...state.connection,
        status,
        error: status === 'error' ? (error ?? 'Unknown error') : null,
      },
    })),

  setRos: (ros) =>
    set((state) => ({ connection: { ...state.connection, ros } })),

  setTransportType: (type: TransportType) => set({ transportType: type }),

  getTopics: async () => {
    const { transport } = get();
    if (!transport) return [];
    return transport.getTopics();
  },

  addSavedConnection: (url, name) =>
    set((state) => {
      const transport = state.transportType;
      const existing = state.savedConnections.findIndex((c) => c.url === url);
      let updated: SavedConnection[];
      if (existing >= 0) {
        updated = [...state.savedConnections];
        updated[existing] = { ...updated[existing], lastUsed: Date.now(), transport, name: name ?? updated[existing].name };
      } else {
        updated = [...state.savedConnections, { url, name, transport, lastUsed: Date.now() }];
      }
      AsyncStorage.setItem(STORAGE_KEY_CONNECTIONS, JSON.stringify(updated)).catch(() => {});
      return { savedConnections: updated };
    }),

  removeSavedConnection: (url) =>
    set((state) => {
      const updated = state.savedConnections.filter((c) => c.url !== url);
      AsyncStorage.setItem(STORAGE_KEY_CONNECTIONS, JSON.stringify(updated)).catch(() => {});
      return { savedConnections: updated };
    }),

  loadSavedConnections: async () => {
    try {
      const connJson = await AsyncStorage.getItem(STORAGE_KEY_CONNECTIONS);
      if (connJson) set({ savedConnections: JSON.parse(connJson) });
    } catch {}
  },

  persistSavedConnections: async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_CONNECTIONS, JSON.stringify(get().savedConnections));
    } catch {}
  },

  connectToUrl: async (url: string) => {
    const { transportType } = get();
    const transport = transportType === 'demo'
      ? new DemoTransport()
      : transportType === 'foxglove'
        ? new FoxgloveTransport()
        : new RosbridgeTransport();

    const unsub = transport.onStatus((status, error) => {
      if (status === 'disconnected' && get().connection.status === 'connected') {
        get().handleDisconnect();
      }
    });

    set((s) => ({
      transport,
      connection: { ...s.connection, url, status: 'connecting', error: null },
    }));

    try {
      await transport.connect(url);
      set((s) => ({
        connection: {
          ...s.connection,
          status: 'connected',
          ros: transportType === 'rosbridge' ? (transport as RosbridgeTransport).getRos() : null,
        },
      }));
      if (!url.startsWith('demo://')) {
        get().addSavedConnection(url);
      }
    } catch (err: any) {
      set((s) => ({
        connection: { ...s.connection, status: 'error', error: err?.message || 'Connection failed' },
      }));
    }
  },

  handleDisconnect: () => {
    const state = get();
    // Don't auto-reconnect demo connections
    if (state.connection.url.startsWith('demo://')) return;
    if (state.reconnectAttempts >= DEFAULTS.maxReconnectAttempts) {
      set({ reconnectAttempts: 0 });
      state.setConnectionStatus('error', 'Connection lost — max reconnect attempts reached');
      return;
    }
    const delay = Math.min(
      DEFAULTS.reconnectBackoffBase * Math.pow(2, state.reconnectAttempts),
      DEFAULTS.reconnectBackoffMax
    );
    const timer = setTimeout(() => {
      set((s) => ({ reconnectAttempts: s.reconnectAttempts + 1 }));
      get().connectToUrl(state.connection.url);
    }, delay);
    set({ reconnectTimer: timer });
  },

  disconnect: () => {
    const state = get();
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    // Clear state first so the onStatus callback won't trigger auto-reconnect
    const transport = state.transport;
    set({
      transport: null,
      connection: { ...initialConnection },
      reconnectAttempts: 0,
      reconnectTimer: null,
    });
    if (transport) {
      transport.disconnect();
    }
  },

  reset: () =>
    set({
      connection: { ...initialConnection },
      transport: null,
      transportType: 'rosbridge',
      savedConnections: [],
      reconnectAttempts: 0,
      reconnectTimer: null,
    }),
}));
