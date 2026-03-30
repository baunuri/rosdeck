// lib/rosbridge-transport.ts
import type { Transport, Subscription, TopicInfo, TransportStatus } from './transport';

let ROSLIB: any = null;

async function loadRoslib() {
  if (!ROSLIB) {
    const mod: any = await import('roslib');
    ROSLIB = mod.default || mod;
  }
  return ROSLIB;
}

export class RosbridgeTransport implements Transport {
  private ros: any = null;
  private status: TransportStatus = 'disconnected';
  private statusListeners: Array<(status: TransportStatus, error?: string) => void> = [];
  private url: string = '';

  getStatus(): TransportStatus {
    return this.status;
  }

  private setStatus(status: TransportStatus, error?: string) {
    this.status = status;
    this.statusListeners.forEach((cb) => cb(status, error));
  }

  async connect(url: string): Promise<void> {
    this.url = url;
    this.setStatus('connecting');
    const roslib = await loadRoslib();

    return new Promise((resolve, reject) => {
      this.ros = new roslib.Ros({ url });

      const timeout = setTimeout(() => {
        this.ros?.close();
        this.setStatus('error', 'Connection timeout');
        reject(new Error('Connection timeout'));
      }, 5000);

      this.ros.on('connection', () => {
        clearTimeout(timeout);
        this.setStatus('connected');
        resolve();
      });

      this.ros.on('error', (err: any) => {
        clearTimeout(timeout);
        this.setStatus('error', err?.message || 'Connection error');
        reject(err);
      });

      this.ros.on('close', () => {
        this.setStatus('disconnected');
      });
    });
  }

  disconnect(): void {
    if (this.ros) {
      this.ros.close();
      this.ros = null;
    }
    this.setStatus('disconnected');
  }

  subscribe(topic: string, messageType: string, callback: (msg: any) => void, throttleRate?: number): Subscription {
    if (!this.ros || !ROSLIB) {
      return { unsubscribe: () => {} };
    }
    const rosTopic = new ROSLIB.Topic({
      ros: this.ros,
      name: topic,
      messageType,
      throttle_rate: throttleRate ?? 0,
    });
    rosTopic.subscribe(callback);
    return {
      unsubscribe: () => rosTopic.unsubscribe(),
    };
  }

  publish(topic: string, messageType: string, msg: any): void {
    if (!this.ros || !ROSLIB) return;
    const rosTopic = new ROSLIB.Topic({
      ros: this.ros,
      name: topic,
      messageType,
    });
    rosTopic.publish(new ROSLIB.Message(msg));
  }

  getTopics(): Promise<TopicInfo[]> {
    return new Promise((resolve) => {
      if (!this.ros) {
        resolve([]);
        return;
      }
      // roslib's getTopics calls the rosapi service. If rosapi isn't running,
      // fall back to getTopicsAndRawTypes or return empty.
      try {
        this.ros.getTopics(
          (result: any) => {
            // Handle both formats: {topics, types} or {topics: [{name, type}]}
            if (result?.topics && Array.isArray(result.topics)) {
              if (typeof result.topics[0] === 'string') {
                // Format: { topics: string[], types: string[] }
                const topics: TopicInfo[] = result.topics.map((name: string, i: number) => ({
                  name,
                  type: (result.types || [])[i] || '',
                }));
                resolve(topics);
              } else {
                // Format: { topics: [{name, type}] }
                resolve(result.topics);
              }
            } else {
              resolve([]);
            }
          },
          (err: any) => {
            console.log('[RosbridgeTransport] getTopics error (rosapi may not be running):', err);
            resolve([]);
          }
        );
      } catch {
        resolve([]);
      }
    });
  }

  onStatus(callback: (status: TransportStatus, error?: string) => void): () => void {
    this.statusListeners.push(callback);
    return () => {
      this.statusListeners = this.statusListeners.filter((cb) => cb !== callback);
    };
  }

  getRos(): any {
    return this.ros;
  }
}
