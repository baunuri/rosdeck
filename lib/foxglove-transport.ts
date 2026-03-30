import type { Transport, Subscription, TopicInfo, TransportStatus } from './transport';
import { MessageReader } from '@foxglove/rosmsg2-serialization';
import { parse as parseMessageDefinition } from '@foxglove/rosmsg';

export class FoxgloveTransport implements Transport {
  private ws: WebSocket | null = null;
  private status: TransportStatus = 'disconnected';
  private statusListeners: Array<(status: TransportStatus, error?: string) => void> = [];
  private subscriptions: Map<number, { topic: string; messageType: string; callback: (msg: any) => void }> = new Map();
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
      // React Native on Android needs it passed as a custom header.
      const ws = new (WebSocket as any)(url, undefined, {
        headers: { 'Sec-WebSocket-Protocol': 'foxglove.sdk.v1' },
      }) as WebSocket;
      this.ws = ws;
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        clearTimeout(timeout);
        this.setStatus('connected');
        resolve();
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        this.setStatus('error', 'Connection error');
        reject(new Error('Connection error'));
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

    // SDK v1: opcode(1) + subId(4) + timestamp(8) = 13 byte header
    const payloadBytes = new Uint8Array(bytes.buffer.slice(bytes.byteOffset + 13));
    const channelInfo = this.getChannelForTopic(topic);

    // Skip expensive deserialization if no subscriber wants this channel's schema.
    // e.g. camera subscribes for CompressedImage but topic publishes raw Image.
    if (channelInfo?.schemaName) {
      const wantedByAnyone = [...this.subscriptions.values()].some(
        (s) => s.topic === topic && s.messageType === channelInfo.schemaName,
      );
      if (!wantedByAnyone) return;
    }

    let parsedMsg: any;
    if (channelInfo?.encoding === 'cdr' && channelInfo.schemaName) {
      // Fast path: extract CompressedImage data directly from CDR
      // without full deserialization (avoids copying large byte arrays)
      if (channelInfo.schemaName === 'sensor_msgs/msg/CompressedImage') {
        try {
          parsedMsg = this.parseCompressedImageFast(payloadBytes);
        } catch { return; }
      } else {
        const reader = this.getMessageReader(channelInfo.schemaName);
        if (!reader) return;
        try {
          parsedMsg = reader.readMessage(payloadBytes);
        } catch { return; }
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
    for (const [, sub] of this.subscriptions) {
      if (sub.topic === topic && (!channelInfo?.schemaName || sub.messageType === channelInfo.schemaName)) {
        try { sub.callback(parsedMsg); } catch {}
      }
    }
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
    this.setStatus('disconnected');
  }

  subscribe(topic: string, messageType: string, callback: (msg: any) => void, _throttleRate?: number): Subscription {
    const subId = this.nextSubId++;
    this.subscriptions.set(subId, { topic, messageType, callback });

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
