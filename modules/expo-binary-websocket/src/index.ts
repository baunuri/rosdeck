import { requireOptionalNativeModule } from 'expo-modules-core';

type Native = {
  connect(url: string, protocols: string[]): number;
  send(id: number, text: string): boolean;
  sendBinary(id: number, data: Uint8Array): boolean;
  close(id: number, code: number, reason: string): void;
  drain(id: number): Uint8Array;
  addListener(event: string, listener: (e: any) => void): { remove(): void };
};

// null when the native module isn't in this build (web, tests).
const native = requireOptionalNativeModule<Native>('ExpoBinaryWebSocket');
export const isBinaryWebSocketAvailable = native != null;

const sockets = new Map<number, BinaryWebSocket>();
let listening = false;

function listen(n: Native) {
  if (listening) return;
  listening = true;
  n.addListener('onOpen', (e) => sockets.get(e.id)?.onopen?.());
  n.addListener('onText', (e) => sockets.get(e.id)?.onmessage?.({ data: e.data }));
  n.addListener('onBinary', (e) => {
    const socket = sockets.get(e.id);
    if (!socket?.onmessage) return;
    // One native call for every frame queued since the last ping: [u32 LE length][bytes]...
    const packed = n.drain(e.id);
    const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
    for (let offset = 0; offset + 4 <= packed.byteLength;) {
      const length = view.getUint32(offset, true);
      socket.onmessage({ data: new Uint8Array(packed.buffer, packed.byteOffset + offset + 4, length) });
      offset += 4 + length;
    }
  });
  n.addListener('onError', (e) => sockets.get(e.id)?.onerror?.({ message: e.message }));
  n.addListener('onClose', (e) => {
    const socket = sockets.get(e.id);
    sockets.delete(e.id);
    socket?.onclose?.({ code: e.code, reason: e.reason });
  });
}

/** Browser-style WebSocket subset; binary messages arrive as Uint8Array. */
export class BinaryWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string | Uint8Array }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  binaryType = 'arraybuffer';
  private readonly id: number;

  constructor(url: string, protocols: string[] = []) {
    if (!native) throw new Error('ExpoBinaryWebSocket native module is not available');
    listen(native);
    this.id = native.connect(url, protocols);
    sockets.set(this.id, this);
  }

  send(data: string | ArrayBuffer | ArrayBufferView) {
    if (typeof data === 'string') native!.send(this.id, data);
    else if (data instanceof ArrayBuffer) native!.sendBinary(this.id, new Uint8Array(data));
    else native!.sendBinary(this.id, new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }

  close(code = 1000, reason = '') {
    native!.close(this.id, code, reason);
  }
}
