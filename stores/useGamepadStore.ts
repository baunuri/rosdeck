import { create } from 'zustand';

interface GamepadState {
  connected: boolean;
  controllerName: string;
  /** Maps widget node ID → resolved stick assignment. Written by useGamepadInput. */
  resolvedMappings: Record<string, 'left' | 'right' | 'none'>;
  setConnected: (connected: boolean, name: string) => void;
  setResolvedMappings: (mappings: Record<string, 'left' | 'right' | 'none'>) => void;
}

export const useGamepadStore = create<GamepadState>((set) => ({
  connected: false,
  controllerName: '',
  resolvedMappings: {},
  setConnected: (connected, name) => set({ connected, controllerName: name }),
  setResolvedMappings: (mappings) => set({ resolvedMappings: mappings }),
}));
