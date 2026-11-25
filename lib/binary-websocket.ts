/**
 * WebSocket whose binary messages reach JS without React Native's base64 round trip.
 * The built-in socket base64-encodes every binary frame natively and decodes it in JS
 * (~130 ms per MB on the JS thread); modules/expo-binary-websocket hands frames over
 * as Uint8Array instead. Falls back to the built-in WebSocket where that module isn't
 * in the build (iOS until it gets a Swift implementation, web, tests).
 */
import { BinaryWebSocket, isBinaryWebSocketAvailable } from '../modules/expo-binary-websocket/src';

export function createBinaryWebSocket(url: string, protocols: string[]): WebSocket {
  if (isBinaryWebSocketAvailable) return new BinaryWebSocket(url, protocols) as unknown as WebSocket;
  const ws = new WebSocket(url, protocols);
  ws.binaryType = 'arraybuffer';
  return ws;
}
