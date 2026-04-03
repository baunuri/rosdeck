import { EventEmitter, type Subscription } from 'expo-modules-core';
import ExpoGamepadModule from './ExpoGamepadModule';

export type GamepadStickEvent = {
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
};

export type GamepadConnectionEvent = {
  connected: boolean;
  name: string;
};

const emitter = new EventEmitter(ExpoGamepadModule);

export function addAxisListener(
  listener: (event: GamepadStickEvent) => void,
): Subscription {
  return emitter.addListener('onGamepadAxis', listener);
}

export function addConnectionListener(
  listener: (event: GamepadConnectionEvent) => void,
): Subscription {
  return emitter.addListener('onGamepadConnection', listener);
}
