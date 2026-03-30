import type { TwistMessage, TwistStampedMessage } from '../types/ros';
import { DEFAULTS } from '../constants/defaults';

// Lazy-load roslib to avoid crashing at module init time.
// roslib eagerly imports fast-png which uses TextDecoder('latin1'),
// unsupported in Hermes. By lazy-loading, we defer until actually connecting.
let _ROSLIB: any = null;
function getRoslib() {
  if (!_ROSLIB) {
    _ROSLIB = require('roslib');
    // Handle both default and named exports
    if (_ROSLIB.default) _ROSLIB = _ROSLIB.default;
  }
  return _ROSLIB;
}

export type TwistField = 'linear.x' | 'linear.y' | 'linear.z' | 'angular.x' | 'angular.y' | 'angular.z';

export function buildTwistMessage(linearX: number, angularZ: number): TwistMessage {
  return {
    linear: { x: linearX, y: 0, z: 0 },
    angular: { x: 0, y: 0, z: angularZ },
  };
}

export function buildTwistFromAxisMapping(
  xValue: number,
  yValue: number,
  xField: TwistField,
  yField: TwistField,
): TwistMessage {
  const twist: TwistMessage = { linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } };
  const [xGroup, xAxis] = xField.split('.') as ['linear' | 'angular', 'x' | 'y' | 'z'];
  const [yGroup, yAxis] = yField.split('.') as ['linear' | 'angular', 'x' | 'y' | 'z'];
  twist[xGroup][xAxis] = xValue;
  twist[yGroup][yAxis] = yValue;
  return twist;
}

export function buildTwistStampedMessage(twist: TwistMessage, frameId: string): TwistStampedMessage {
  const now = Date.now();
  return {
    header: {
      stamp: {
        sec: Math.floor(now / 1000),
        nanosec: (now % 1000) * 1_000_000,
      },
      frame_id: frameId,
    },
    twist,
  };
}

export function parseRobotIp(input: string): string {
  let cleaned = input.replace(/^wss?:\/\//, '');
  cleaned = cleaned.split(':')[0];
  cleaned = cleaned.replace(/\/+$/, '');
  return cleaned;
}

export function buildWebSocketUrl(ipPort: string): string {
  const s = ipPort.replace(/\s/g, '');
  if (s.startsWith('ws://') || s.startsWith('wss://')) {
    return s;
  }
  if (!s.includes(':')) {
    return `ws://${s}:${DEFAULTS.rosbridgePort}`;
  }
  return `ws://${s}`;
}

export function buildMjpegUrl(robotIp: string, port: number, topic: string): string {
  // Don't encode the topic — web_video_server expects raw topic names with slashes
  return `http://${robotIp}:${port}/stream?topic=${topic}&type=mjpeg`;
}

export function createRosConnection(url: string): any {
  const ROSLIB = getRoslib();
  return new ROSLIB.Ros({ url });
}

export function createCmdVelTopic(ros: any, topicName: string, stamped: boolean): any {
  const ROSLIB = getRoslib();
  return new ROSLIB.Topic({
    ros,
    name: topicName,
    messageType: stamped ? 'geometry_msgs/msg/TwistStamped' : 'geometry_msgs/msg/Twist',
  });
}
