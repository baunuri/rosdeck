import { FoxgloveTransport } from '../../lib/foxglove-transport';

// Server message frame: opcode 0x01, subId (u32 LE), timestamp (u64), JSON payload.
function frame(subId: number, payload: object): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(payload));
  const bytes = new Uint8Array(13 + body.length);
  bytes[0] = 0x01;
  new DataView(bytes.buffer).setUint32(1, subId, true);
  bytes.set(body, 13);
  return bytes;
}

describe('FoxgloveTransport throttling', () => {
  let now = 1000;
  beforeEach(() => { jest.spyOn(Date, 'now').mockImplementation(() => now); });
  afterEach(() => jest.restoreAllMocks());

  function setup(throttleMs?: number) {
    const transport = new FoxgloveTransport() as any;
    // JSON-encoded channel, so no schema/CDR is needed.
    transport.serverChannels.set(7, { topic: '/cloud', schemaName: 'test/Msg', encoding: 'json' });
    transport.topicToChannelId.set('/cloud', 7);
    const received: any[] = [];
    transport.subscribe('/cloud', 'test/Msg', (m: any) => received.push(m), throttleMs);
    return { transport, received };
  }

  it('delivers every message without a throttle', () => {
    const { transport, received } = setup();
    transport.handleBinaryMessage(frame(1, { n: 1 }));
    transport.handleBinaryMessage(frame(1, { n: 2 }));
    expect(received.map((m) => m.n)).toEqual([1, 2]);
  });

  it('reads only its own bytes when a frame is a view into a larger buffer', () => {
    const { transport, received } = setup();
    const a = frame(1, { n: 1 });
    const b = frame(1, { n: 2 });
    const packed = new Uint8Array(a.length + b.length);
    packed.set(a);
    packed.set(b, a.length);
    transport.handleBinaryMessage(packed.subarray(0, a.length));
    transport.handleBinaryMessage(packed.subarray(a.length));
    expect(received.map((m) => m.n)).toEqual([1, 2]);
  });

  it('drops messages inside the throttle window', () => {
    const { transport, received } = setup(250);
    transport.handleBinaryMessage(frame(1, { n: 1 }));
    now += 100;
    transport.handleBinaryMessage(frame(1, { n: 2 }));
    now += 200;
    transport.handleBinaryMessage(frame(1, { n: 3 }));
    expect(received.map((m) => m.n)).toEqual([1, 3]);
  });
});
