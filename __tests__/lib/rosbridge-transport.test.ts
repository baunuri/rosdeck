// __tests__/lib/rosbridge-transport.test.ts

jest.mock('roslib', () => {
  const mockRos = {
    on: jest.fn(),
    close: jest.fn(),
    getTopics: jest.fn(),
  };
  return {
    __esModule: true,
    default: { Ros: jest.fn(() => mockRos), Topic: jest.fn(), Message: jest.fn() },
  };
});

import { RosbridgeTransport } from '../../lib/rosbridge-transport';

describe('RosbridgeTransport', () => {
  let transport: RosbridgeTransport;

  beforeEach(() => {
    transport = new RosbridgeTransport();
  });

  it('starts disconnected', () => {
    expect(transport.getStatus()).toBe('disconnected');
  });

  it('disconnect is safe when not connected', () => {
    expect(() => transport.disconnect()).not.toThrow();
  });
});
