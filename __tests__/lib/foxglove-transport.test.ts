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

describe('FoxgloveTransport decode backoff', () => {
  afterEach(() => jest.restoreAllMocks());

  it('spaces out a topic in proportion to its decode time', () => {
    let now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const t = new FoxgloveTransport() as any;
    t.serverChannels.set(7, { topic: '/heavy', schemaName: 'pkg/Heavy', encoding: 'cdr' });
    t.topicToChannelId.set('/heavy', 7);
    t.messageReaders.set('pkg/Heavy', { readMessage: () => { now += 100; return { ok: true }; } }); // 100 ms to decode
    const received: any[] = [];
    t.subscribe('/heavy', 'pkg/Heavy', (m: any) => received.push(m));
    const frame = new Uint8Array(20); frame[0] = 0x01; new DataView(frame.buffer).setUint32(1, 1, true);
    t.handleBinaryMessage(frame);          // decoded: 100 ms, so next allowed 500 ms later
    now += 200; t.handleBinaryMessage(frame); // too soon: dropped before decoding
    now += 400; t.handleBinaryMessage(frame); // 700 ms after the last delivery: decoded
    expect(received).toHaveLength(2);
  });
});

describe('FoxgloveTransport link sample', () => {
  it('records each topic\'s bridge-timestamp offset and bytes, then resets the byte count', () => {
    let now = 10_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const t = new FoxgloveTransport() as any;
    t.serverChannels.set(7, { topic: '/a', schemaName: 'test/Msg', encoding: 'json' });
    t.topicToChannelId.set('/a', 7);
    t.subscribe('/a', 'test/Msg', () => {});
    const f = frame(1, { n: 1 });
    new DataView(f.buffer).setBigUint64(5, BigInt(9_000) * 1_000_000n, true); // stamped at t=9000 ms
    t.handleBinaryMessage(f);
    const s = t.takeLinkSample();
    expect(s.minOffsetMs).toBe(1000);
    expect(s.topics[0]).toMatchObject({ topic: '/a', offsetMs: 1000, bytes: f.length });
    expect(t.takeLinkSample().topics[0].bytes).toBe(0);
    jest.restoreAllMocks();
  });
});

describe('FoxgloveTransport TF delivery', () => {
  it('never backs off TF: each message may carry different transforms (e.g. two /tf_static publishers)', () => {
    let now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const t = new FoxgloveTransport() as any;
    t.serverChannels.set(3, { topic: '/tf_static', schemaName: 'tf2_msgs/msg/TFMessage', encoding: 'cdr' });
    t.topicToChannelId.set('/tf_static', 3);
    t.messageReaders.set('tf2_msgs/msg/TFMessage', { readMessage: () => { now += 50; return { transforms: [] }; } }); // slow (cold) decode
    const received: any[] = [];
    t.subscribe('/tf_static', 'tf2_msgs/msg/TFMessage', (m: any) => received.push(m));
    const f = new Uint8Array(20); f[0] = 0x01; new DataView(f.buffer).setUint32(1, 1, true);
    t.handleBinaryMessage(f);
    t.handleBinaryMessage(f); // the second publisher's latched message, right behind the first
    expect(received).toHaveLength(2);
    jest.restoreAllMocks();
  });
});
