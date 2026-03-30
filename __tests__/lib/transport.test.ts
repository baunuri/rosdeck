// __tests__/lib/transport.test.ts
import type { Transport, Subscription, TopicInfo, TransportStatus } from '../../lib/transport';

describe('Transport interface', () => {
  it('defines required methods', () => {
    const mock: Transport = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
      subscribe: jest.fn().mockReturnValue({ unsubscribe: jest.fn() }),
      publish: jest.fn(),
      getTopics: jest.fn().mockResolvedValue([]),
      onStatus: jest.fn().mockReturnValue(jest.fn()),
      getStatus: jest.fn().mockReturnValue('disconnected'),
    };
    expect(mock.getStatus()).toBe('disconnected');
  });
});
