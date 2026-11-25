import type { Transport, Subscription, TopicInfo, TransportStatus } from './transport';
import { MessageReader } from '@foxglove/rosmsg2-serialization';
import { parse as parseMessageDefinition } from '@foxglove/rosmsg';
import { createBinaryWebSocket } from './binary-websocket';
import { isJazzyMarkerSchema, parseMarkerArrayFast } from './marker-cdr';
import type { LinkSample } from './link-health';

/**
 * A topic whose messages take T ms to decode is delivered at most once per DECODE_BACKOFF×T ms,
 * capping it at ~20% of the JS thread. Hermes decodes a 7.6k-marker MarkerArray in ~1 s; at its
 * native 14 Hz that froze the app. Cheap topics (T ≈ 0) are unaffected.
 */
const DECODE_BACKOFF = 5;

export class FoxgloveTransport implements Transport {
  private ws: WebSocket | null = null;
  private status: TransportStatus = 'disconnected';
  private statusListeners: Array<(status: TransportStatus, error?: string) => void> = [];
  private decodeMs = new Map<string, number>();
  // Lag tracking (see lib/link-health.ts): per topic, the latest (local now − bridge timestamp)
  // and bytes received since the last takeLinkSample().
  private arrivals = new Map<string, { offsetMs: number; bytes: number; seenAt: number }>();
  private minOffsetMs = Infinity;
  private subscriptions: Map<number, {
    topic: string; messageType: string; callback: (msg: any) => void;
    throttleMs: number; lastDelivered: number;
  }> = new Map();
  private nextSubId = 1;
  private serverChannels: Map<number, { topic: string; schemaName: string; encoding?: string }> = new Map();
  private topicToChannelId: Map<string, number> = new Map();
  private clientChannels: Map<string, number> = new Map();
  private nextClientChannelId = 1;
  private messageReaders: Map<string, MessageReader> = new Map();
  private schemaDefinitions: Map<string, string> = new Map();
  private pendingSubscriptions: Array<{ subId: number; topic: string }> = [];
  // Multiplexing: one bridge-level sub per topic, fan-out to all internal callbacks.
  // foxglove_bridge may only deliver messages to the first subscription ID per channel,
  // so we deduplicate at the bridge level and route internally.
  private topicBridgeSub: Map<string, number> = new Map();   // topic → bridge subId
  private bridgeSubToTopic: Map<number, string> = new Map(); // bridge subId → topic

  getStatus(): TransportStatus {
    return this.status;
  }

  get minOffset() { return this.minOffsetMs; }

  /** Worst queueing delay among topics heard in the last few seconds, above `baseline` (ms). */
  lagAbove(baseline: number, now = Date.now()) {
    let worst = 0;
    for (const a of this.arrivals.values()) if (now - a.seenAt < 5000) worst = Math.max(worst, a.offsetMs - baseline);
    return worst;
  }

  /** Arrival stats since the previous call (byte counters reset). One caller: the lag banner. */
  takeLinkSample(): LinkSample {
    const topics = [...this.arrivals].map(([topic, a]) => ({ topic, offsetMs: a.offsetMs, bytes: a.bytes, seenAt: a.seenAt }));
    for (const a of this.arrivals.values()) a.bytes = 0;
    return { minOffsetMs: this.minOffsetMs, topics };
  }

  private setStatus(status: TransportStatus, error?: string) {
    this.status = status;
    this.statusListeners.forEach((cb) => cb(status, error));
  }

  async connect(url: string): Promise<void> {
    this.setStatus('connecting');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.ws?.close();
        this.setStatus('error', 'Connection timeout');
        reject(new Error('Connection timeout'));
      }, 5000);

      // foxglove_bridge 3.x uses 'foxglove.sdk.v1' subprotocol.
      // Standard protocols argument: RN forwards it natively and browsers honor it
      // (browsers ignore the RN-only `headers` option).
      const ws = createBinaryWebSocket(url, ['foxglove.sdk.v1']);
      this.ws = ws;

      ws.onopen = () => {
        clearTimeout(timeout);
        this.setStatus('connected');
        resolve();
      };

      ws.onerror = (event: any) => {
        clearTimeout(timeout);
        // RN's error event carries `message`; browsers' carries nothing useful.
        const message = event?.message ? `Connection error: ${event.message}` : 'Connection error';
        this.setStatus('error', message);
        reject(new Error(message));
      };

      ws.onclose = () => {
        this.setStatus('disconnected');
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          if (event.data.startsWith('{') || event.data.startsWith('[')) {
            try { this.handleMessage(JSON.parse(event.data)); } catch {}
          } else {
            this.handleBase64Message(event.data);
          }
        } else {
          try { this.handleBinaryMessage(event.data); } catch {}
        }
      };
    });
  }

  private handleMessage(msg: any) {
    switch (msg.op) {
      case 'serverInfo':
        break;
      case 'advertise':
        if (Array.isArray(msg.channels)) {
          for (const ch of msg.channels) {
            this.serverChannels.set(ch.id, { topic: ch.topic, schemaName: ch.schemaName, encoding: ch.encoding });
            this.topicToChannelId.set(ch.topic, ch.id);
            if (ch.schema && ch.schemaName) {
              this.schemaDefinitions.set(ch.schemaName, ch.schema);
            }
          }
          this.flushPendingSubscriptions();
        }
        break;
    }
  }

  private handleBinaryMessage(data: any) {
    let bytes: Uint8Array;

    if (data instanceof ArrayBuffer) {
      bytes = new Uint8Array(data);
    } else if (data instanceof Uint8Array) {
      bytes = data;
    } else if (data?.buffer instanceof ArrayBuffer) {
      bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } else {
      return;
    }

    if (bytes.length < 13) return;

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const opcode = view.getUint8(0);

    // foxglove.sdk.v1: opcode 1 = serverMessage
    if (opcode !== 0x01) return;

    const subscriptionId = view.getUint32(1, true);
    // Resolve topic via the bridge-subId → topic map (works even if the original
    // subscriber that created this bridge subscription has since unsubscribed).
    const topic = this.bridgeSubToTopic.get(subscriptionId);
    if (!topic) return;

    // Every frame counts toward lag/bandwidth, throttled or not: it already crossed the link.
    const now = Date.now();
    const offsetMs = now - Number(view.getBigUint64(5, true)) / 1e6;
    if (offsetMs < this.minOffsetMs) this.minOffsetMs = offsetMs;
    const arrival = this.arrivals.get(topic);
    if (arrival) {
      arrival.offsetMs = offsetMs; arrival.bytes += bytes.byteLength; arrival.seenAt = now;
    } else {
      this.arrivals.set(topic, { offsetMs, bytes: bytes.byteLength, seenAt: now });
    }

    // Throttled or unwanted messages are dropped before any copy or deserialization.
    const due = this.dueSubscribers(topic, now);
    if (due.length === 0) return;

    // SDK v1: opcode(1) + subId(4) + timestamp(8) = 13 byte header
    // Bounded slice: `bytes` may be a view into a larger buffer (batched frames).
    const payloadBytes = new Uint8Array(bytes.buffer.slice(bytes.byteOffset + 13, bytes.byteOffset + bytes.byteLength));
    const channelInfo = this.getChannelForTopic(topic);

    let parsedMsg: any;
    if (channelInfo?.encoding === 'cdr' && channelInfo.schemaName) {
      // Fast path: extract CompressedImage data directly from CDR
      // without full deserialization (avoids copying large byte arrays)
      if (channelInfo.schemaName === 'sensor_msgs/msg/CompressedImage') {
        try {
          parsedMsg = this.parseCompressedImageFast(payloadBytes);
        } catch { return; }
      } else if (channelInfo.schemaName === 'visualization_msgs/msg/MarkerArray') {
        // Generic decoding of large marker arrays takes ~1 s in Hermes (see lib/marker-cdr.ts).
        const started = Date.now();
        try {
          const schema = this.schemaDefinitions.get(channelInfo.schemaName) ?? '';
          parsedMsg = parseMarkerArrayFast(payloadBytes, isJazzyMarkerSchema(schema));
        } catch { return; }
        const took = Date.now() - started;
        this.decodeMs.set(topic, 0.7 * (this.decodeMs.get(topic) ?? took) + 0.3 * took);
      } else {
        const reader = this.getMessageReader(channelInfo.schemaName);
        if (!reader) return;
        const started = Date.now();
        try {
          parsedMsg = reader.readMessage(payloadBytes);
        } catch { return; }
        // Smoothed decode time per topic (drives the backoff in dueSubscribers).
        const took = Date.now() - started;
        this.decodeMs.set(topic, 0.7 * (this.decodeMs.get(topic) ?? took) + 0.3 * took);
      }
    } else {
      try {
        parsedMsg = JSON.parse(new TextDecoder().decode(payloadBytes));
      } catch { return; }
    }

    // Fan-out: deliver to ALL subscribers for this topic, not just the one
    // whose subId the bridge used. This is necessary because foxglove_bridge
    // may only ever send messages tagged with the first subscription ID for a
    // given channel, ignoring subsequent ones from the same client.
    for (const sub of due) {
      sub.lastDelivered = now;
      try { sub.callback(parsedMsg); } catch {}
    }
  }

  /**
   * Subscribers wanting this topic's next message. Same semantics as rosbridge's
   * throttle_rate, enforced client-side before deserialization so large messages
   * (point clouds) are cheap to drop.
   */
  private dueSubscribers(topic: string, now: number) {
    const schemaName = this.getChannelForTopic(topic)?.schemaName;
    // Back off topics that are expensive to decode so they can't monopolise the JS thread.
    // Never TF: each message may carry different transforms (/tf_static has one latched message
    // per publisher, back to back), so a skipped one can lose a link of the tree for good.
    const minGap = schemaName === 'tf2_msgs/msg/TFMessage' ? 0 : DECODE_BACKOFF * (this.decodeMs.get(topic) ?? 0);
    return [...this.subscriptions.values()].filter((s) =>
      s.topic === topic &&
      (!schemaName || s.messageType === schemaName) &&
      now - s.lastDelivered >= Math.max(s.throttleMs, minGap));
  }

  private getChannelForTopic(topic: string): { encoding?: string; schemaName?: string } | undefined {
    const channelId = this.topicToChannelId.get(topic);
    if (channelId === undefined) return undefined;
    return this.serverChannels.get(channelId);
  }

  private getChannelForSubscription(subId: number): { encoding?: string; schemaName?: string } | undefined {
    const sub = this.subscriptions.get(subId);
    if (!sub) return undefined;
    return this.getChannelForTopic(sub.topic);
  }

  private getMessageReader(schemaName: string): MessageReader | undefined {
    let reader = this.messageReaders.get(schemaName);
    if (reader) return reader;

    const schema = this.schemaDefinitions.get(schemaName);
    if (!schema) return undefined;

    try {
      const msgDefs = parseMessageDefinition(schema, { ros2: true });
      reader = new MessageReader(msgDefs);
      this.messageReaders.set(schemaName, reader);
      return reader;
    } catch {
      return undefined;
    }
  }

  /**
   * Fast CDR parser for sensor_msgs/msg/CompressedImage.
   * Extracts the JPEG data bytes directly without full CDR deserialization.
   * CDR layout (little-endian):
   *   [4] encapsulation header
   *   [4] stamp.sec (u32)
   *   [4] stamp.nanosec (u32)
   *   [4+N+pad] frame_id string (u32 length + chars + null + padding to 4-byte boundary)
   *   [4+N+pad] format string (u32 length + chars + null + padding)
   *   [4+N] data byte array (u32 length + bytes)
   */
  private parseCompressedImageFast(cdr: Uint8Array): { data: Uint8Array; format: string } {
    const view = new DataView(cdr.buffer, cdr.byteOffset, cdr.byteLength);
    let offset = 4; // skip encapsulation header

    // Skip header.stamp (sec + nanosec = 8 bytes)
    offset += 8;

    // Skip header.frame_id (length-prefixed string, aligned to 4 bytes)
    const frameIdLen = view.getUint32(offset, true);
    offset += 4 + frameIdLen;
    // Align to 4-byte boundary
    offset = (offset + 3) & ~3;

    // Read format string
    const formatLen = view.getUint32(offset, true);
    offset += 4;
    const format = new TextDecoder().decode(cdr.subarray(offset, offset + formatLen - 1)); // -1 to skip null terminator
    offset += formatLen;
    offset = (offset + 3) & ~3;

    // Read data byte array — slice to get a zero-offset copy so that
    // Skia.Data.fromBytes sees byteOffset=0 (not a view into the CDR buffer).
    const dataLen = view.getUint32(offset, true);
    offset += 4;
    const data = cdr.slice(offset, offset + dataLen);

    return { data, format };
  }

  private handleBase64Message(b64: string) {
    try {
      const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      this.handleBinaryMessage(binary.buffer);
    } catch {}
  }

  private flushPendingSubscriptions() {
    const remaining: typeof this.pendingSubscriptions = [];
    for (const pending of this.pendingSubscriptions) {
      const channelId = this.topicToChannelId.get(pending.topic);
      if (channelId !== undefined && this.ws) {
        this.ws.send(JSON.stringify({
          op: 'subscribe',
          subscriptions: [{ id: pending.subId, channelId }],
        }));
      } else {
        remaining.push(pending);
      }
    }
    this.pendingSubscriptions = remaining;
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
    this.serverChannels.clear();
    this.topicToChannelId.clear();
    this.clientChannels.clear();
    this.pendingSubscriptions = [];
    this.nextClientChannelId = 1;
    this.messageReaders.clear();
    this.schemaDefinitions.clear();
    this.topicBridgeSub.clear();
    this.bridgeSubToTopic.clear();
    this.arrivals.clear();
    this.minOffsetMs = Infinity;
    this.setStatus('disconnected');
  }

  subscribe(topic: string, messageType: string, callback: (msg: any) => void, throttleRate?: number): Subscription {
    const subId = this.nextSubId++;
    this.subscriptions.set(subId, { topic, messageType, callback, throttleMs: throttleRate ?? 0, lastDelivered: 0 });

    if (!this.topicBridgeSub.has(topic)) {
      // First subscriber for this topic — create the bridge-level subscription.
      this.topicBridgeSub.set(topic, subId);
      this.bridgeSubToTopic.set(subId, topic);
      const channelId = this.topicToChannelId.get(topic);
      if (channelId !== undefined && this.ws) {
        this.ws.send(JSON.stringify({
          op: 'subscribe',
          subscriptions: [{ id: subId, channelId }],
        }));
      } else {
        this.pendingSubscriptions.push({ subId, topic });
      }
    }
    // Subsequent subscribers for the same topic share the existing bridge subscription
    // and receive messages via the fan-out in handleBinaryMessage.

    return {
      unsubscribe: () => {
        this.subscriptions.delete(subId);
        this.pendingSubscriptions = this.pendingSubscriptions.filter((p) => p.subId !== subId);

        // Only send bridge unsubscribe when the last callback for this topic is removed.
        const remaining = [...this.subscriptions.values()].some(s => s.topic === topic);
        if (!remaining) {
          const bridgeSubId = this.topicBridgeSub.get(topic);
          this.topicBridgeSub.delete(topic);
          if (bridgeSubId !== undefined) {
            this.bridgeSubToTopic.delete(bridgeSubId);
            const ch = this.topicToChannelId.get(topic);
            if (ch !== undefined && this.ws) {
              this.ws.send(JSON.stringify({
                op: 'unsubscribe',
                subscriptionIds: [bridgeSubId],
              }));
            }
          }
        }
      },
    };
  }

  private advertiseClient(topic: string, messageType: string): number {
    let channelId = this.clientChannels.get(topic);
    if (channelId !== undefined) return channelId;

    channelId = this.nextClientChannelId++;
    this.clientChannels.set(topic, channelId);

    if (this.ws) {
      this.ws.send(JSON.stringify({
        op: 'advertise',
        channels: [{
          id: channelId,
          topic,
          encoding: 'json',
          schemaName: messageType,
        }],
      }));
    }
    return channelId;
  }

  publish(topic: string, messageType: string, msg: any): void {
    if (!this.ws) return;
    const channelId = this.advertiseClient(topic, messageType);

    // Binary frame: opcode(1) + channelId(4) + payload
    const jsonBytes = new TextEncoder().encode(JSON.stringify(msg));
    const buffer = new ArrayBuffer(5 + jsonBytes.length);
    const view = new DataView(buffer);
    view.setUint8(0, 0x01);
    view.setUint32(1, channelId, true);
    new Uint8Array(buffer, 5).set(jsonBytes);

    this.ws.send(buffer);
  }

  async getTopics(): Promise<TopicInfo[]> {
    const topics: TopicInfo[] = [];
    for (const [, channel] of this.serverChannels) {
      topics.push({ name: channel.topic, type: channel.schemaName });
    }
    return topics;
  }

  onStatus(callback: (status: TransportStatus, error?: string) => void): () => void {
    this.statusListeners.push(callback);
    return () => {
      this.statusListeners = this.statusListeners.filter((cb) => cb !== callback);
    };
  }
}

/**
 * Message types big enough to back up the link. foxglove_bridge queues each client's messages
 * in one FIFO, so a backed-up point cloud stream delays everything behind it, /tf included.
 * These get a second connection (own bridge queue, own TCP stream); everything else, plus
 * publishing, stays on the first, so the robot pose and small topics stay current.
 */
const BULK_TYPES = new Set([
  'sensor_msgs/msg/PointCloud2', 'sensor_msgs/msg/Image', 'sensor_msgs/msg/CompressedImage',
  'foxglove_msgs/msg/CompressedVideo', 'nav_msgs/msg/OccupancyGrid', 'visualization_msgs/msg/MarkerArray',
]);

/**
 * When the bulk connection is this far behind, replace it: the bridge frees a closed client's
 * queue. Safety net for bridges whose per-client queue is unbounded in practice (foxglove_bridge
 * < 3.4, or the default message_backlog_size of 1024 large messages ≈ GBs on the robot).
 */
const BULK_RESET_LAG_MS = 3000;
/** Give a fresh connection time to get going before judging it again. */
const BULK_RESET_COOLDOWN_MS = 10_000;

export class SplitFoxgloveTransport implements Transport {
  private main: FoxgloveTransport;
  private bulk: FoxgloveTransport;
  private url = '';
  private bulkSubs = new Set<{ topic: string; type: string; cb: (msg: any) => void; throttle?: number; handle: Subscription }>();
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private lastReset = 0;
  private resets = 0;

  constructor(private readonly makeTransport = () => new FoxgloveTransport()) {
    this.main = makeTransport();
    this.bulk = makeTransport();
  }

  async connect(url: string): Promise<void> {
    this.url = url;
    const [main, bulk] = await Promise.allSettled([this.main.connect(url), this.bulk.connect(url)]);
    if (main.status === 'rejected') { this.bulk.disconnect(); throw main.reason; }
    // ponytail: no second connection (e.g. a client limit) → everything shares the first.
    if (bulk.status === 'rejected') { this.bulk = this.main; return; }
    this.watchBulk(this.bulk);
    this.lastReset = Date.now();
    this.watchdog = setInterval(() => this.checkBulkLag(), 1000);
  }

  /** Losing the bulk connection loses its topics: treat it as losing the robot (unless we replaced it). */
  private watchBulk(t: FoxgloveTransport) {
    t.onStatus((s) => { if (t === this.bulk && (s === 'disconnected' || s === 'error')) this.main.disconnect(); });
  }

  checkBulkLag(now = Date.now()) {
    if (this.main.getStatus() !== 'connected') { this.stopWatchdog(); return; }
    if (now - this.lastReset < BULK_RESET_COOLDOWN_MS) return;
    // Main carries /tf, so its baseline stays honest while bulk is backed up.
    const baseline = Math.min(this.main.minOffset, this.bulk.minOffset);
    if (this.bulk.lagAbove(baseline, now) > BULK_RESET_LAG_MS) this.resetBulk(now);
  }

  private async resetBulk(now: number) {
    this.lastReset = now;
    const fresh = this.makeTransport();
    try { await fresh.connect(this.url); } catch { return; } // keep the old one; retry after the cooldown
    for (const s of this.bulkSubs) s.handle = fresh.subscribe(s.topic, s.type, s.cb, s.throttle);
    const old = this.bulk;
    this.bulk = fresh;
    this.watchBulk(fresh);
    this.resets++;
    old.disconnect();
  }

  private stopWatchdog() {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  disconnect(): void {
    this.stopWatchdog();
    this.main.disconnect();
    if (this.bulk !== this.main) this.bulk.disconnect();
  }

  subscribe(topic: string, messageType: string, callback: (msg: any) => void, throttleRate?: number): Subscription {
    if (!BULK_TYPES.has(messageType)) return this.main.subscribe(topic, messageType, callback, throttleRate);
    const entry = { topic, type: messageType, cb: callback, throttle: throttleRate, handle: this.bulk.subscribe(topic, messageType, callback, throttleRate) };
    this.bulkSubs.add(entry);
    return { unsubscribe: () => { this.bulkSubs.delete(entry); entry.handle.unsubscribe(); } };
  }

  publish(topic: string, messageType: string, msg: any): void { this.main.publish(topic, messageType, msg); }
  getTopics(): Promise<TopicInfo[]> { return this.main.getTopics(); }
  onStatus(cb: (status: TransportStatus, error?: string) => void): () => void { return this.main.onStatus(cb); }
  getStatus(): TransportStatus { return this.main.getStatus(); }

  takeLinkSample(): LinkSample {
    const a = this.main.takeLinkSample();
    if (this.bulk === this.main) return a;
    const b = this.bulk.takeLinkSample();
    // Same two clocks on both connections, so the smaller baseline applies to both.
    return { minOffsetMs: Math.min(a.minOffsetMs, b.minOffsetMs), topics: [...a.topics, ...b.topics], resets: this.resets };
  }
}
