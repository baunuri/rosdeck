export const DEFAULTS = {
  rosbridgePort: 9090,
  foxglovePort: 8765,
  mjpegPort: 8080,
  cmdVelTopic: '/cmd_vel',
  cameraTopic: '/camera/image_raw/compressed',
  maxLinearVel: 0.5,
  maxAngularVel: 1.0,
  publishRateHz: 10,
  connectionTimeoutMs: 5000,
  maxReconnectAttempts: 10,
  reconnectBackoffBase: 1000,
  reconnectBackoffMax: 30000,
} as const;
