export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type CameraSource = 'mjpeg' | 'rosbridge';

export interface SavedConnection {
  url: string;
  name?: string;
  transport?: 'rosbridge' | 'foxglove' | 'demo';
  lastUsed: number;
}

export interface TwistMessage {
  linear: { x: number; y: number; z: number };
  angular: { x: number; y: number; z: number };
}

export interface TwistStampedMessage {
  header: {
    stamp: { sec: number; nanosec: number };
    frame_id: string;
  };
  twist: TwistMessage;
}
