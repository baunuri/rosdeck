// lib/transport.ts

export interface Subscription {
  unsubscribe: () => void;
}

export interface TopicInfo {
  name: string;
  type: string;
}

export type TransportStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface Transport {
  connect(url: string): Promise<void>;
  disconnect(): void;
  subscribe(topic: string, messageType: string, callback: (msg: any) => void, throttleRate?: number): Subscription;
  publish(topic: string, messageType: string, msg: any): void;
  getTopics(): Promise<TopicInfo[]>;
  onStatus(callback: (status: TransportStatus, error?: string) => void): () => void;
  getStatus(): TransportStatus;
}

export type TransportType = 'rosbridge' | 'foxglove' | 'demo';
