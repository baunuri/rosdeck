const ROSLIB = {
  Ros: jest.fn().mockImplementation((options: Record<string, unknown>) => ({
    url: options?.url,
    on: jest.fn(),
    close: jest.fn(),
  })),
  Topic: jest.fn().mockImplementation((options: Record<string, unknown>) => ({
    name: options?.name,
    messageType: options?.messageType,
    publish: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  })),
};

export default ROSLIB;
