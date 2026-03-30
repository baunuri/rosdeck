// __tests__/lib/demo-transport.test.ts
import { DemoTransport } from '../../lib/demo-transport';

describe('DemoTransport', () => {
  let transport: DemoTransport;

  beforeEach(() => {
    transport = new DemoTransport();
  });

  afterEach(() => {
    transport.disconnect();
  });

  it('starts disconnected', () => {
    expect(transport.getStatus()).toBe('disconnected');
  });

  it('connect resolves and sets status to connected', async () => {
    await transport.connect('demo://localhost');
    expect(transport.getStatus()).toBe('connected');
  });

  it('disconnect sets status to disconnected', async () => {
    await transport.connect('demo://localhost');
    transport.disconnect();
    expect(transport.getStatus()).toBe('disconnected');
  });

  it('getTopics returns hardcoded ROS2 topics', async () => {
    await transport.connect('demo://localhost');
    const topics = await transport.getTopics();
    expect(topics.length).toBeGreaterThan(0);
    const names = topics.map((t) => t.name);
    expect(names).toContain('/cmd_vel');
    expect(names).toContain('/camera/image_raw');
    expect(names).toContain('/map');
  });

  it('subscribe returns a Subscription with unsubscribe', async () => {
    await transport.connect('demo://localhost');
    const callback = jest.fn();
    const sub = transport.subscribe('/cmd_vel', 'geometry_msgs/msg/Twist', callback);
    expect(sub).toHaveProperty('unsubscribe');
    expect(typeof sub.unsubscribe).toBe('function');
    sub.unsubscribe();
  });

  it('subscribe delivers messages on a timer', async () => {
    jest.useFakeTimers();
    await transport.connect('demo://localhost');
    const callback = jest.fn();
    transport.subscribe('/diagnostics', 'diagnostic_msgs/msg/DiagnosticArray', callback);
    jest.advanceTimersByTime(2000);
    expect(callback).toHaveBeenCalled();
    transport.disconnect();
    jest.useRealTimers();
  });

  it('publish does not throw', async () => {
    await transport.connect('demo://localhost');
    expect(() => {
      transport.publish('/cmd_vel', 'geometry_msgs/msg/Twist', { linear: { x: 0 } });
    }).not.toThrow();
  });

  it('onStatus fires callback on connect', async () => {
    const callback = jest.fn();
    transport.onStatus(callback);
    await transport.connect('demo://localhost');
    expect(callback).toHaveBeenCalledWith('connected', undefined);
  });

  it('onStatus returns unsubscribe function', () => {
    const callback = jest.fn();
    const unsub = transport.onStatus(callback);
    expect(typeof unsub).toBe('function');
  });
});
