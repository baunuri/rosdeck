import { buildTwistMessage, buildTwistStampedMessage, parseRobotIp } from '../../lib/ros';

describe('buildTwistMessage', () => {
  it('creates a Twist message with given velocities', () => {
    const msg = buildTwistMessage(0.5, 0.3);
    expect(msg).toEqual({
      linear: { x: 0.5, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0.3 },
    });
  });

  it('creates a zero Twist message', () => {
    const msg = buildTwistMessage(0, 0);
    expect(msg.linear.x).toBe(0);
    expect(msg.angular.z).toBe(0);
  });
});

describe('buildTwistStampedMessage', () => {
  it('wraps Twist in stamped header with frame_id', () => {
    const msg = buildTwistStampedMessage(0.5, 0.3, 'base_link');
    expect(msg.header.frame_id).toBe('base_link');
    expect(msg.header.stamp.sec).toBeGreaterThan(0);
    expect(msg.twist.linear.x).toBe(0.5);
    expect(msg.twist.angular.z).toBe(0.3);
  });
});

describe('parseRobotIp', () => {
  it('extracts IP from ws:// URL', () => {
    expect(parseRobotIp('ws://192.168.1.50:9090')).toBe('192.168.1.50');
  });

  it('extracts IP from plain IP:port input', () => {
    expect(parseRobotIp('192.168.1.50:9090')).toBe('192.168.1.50');
  });

  it('extracts IP from plain IP without port', () => {
    expect(parseRobotIp('192.168.1.50')).toBe('192.168.1.50');
  });
});
