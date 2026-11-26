jest.mock('../../stores/useRosStore', () => ({ useRosStore: jest.fn() }));
jest.mock('../../stores/useSettingsStore', () => ({
  useSettingsStore: { getState: () => ({ publishRateHz: 10 }), subscribe: jest.fn() },
}));
jest.mock('../../lib/ros', () => ({}));

import { shouldPublish } from '../../hooks/useCmdVelPublisher';

describe('shouldPublish', () => {
  it('always publishes when idle publishing is on', () => {
    expect(shouldPublish(true, true, true)).toBe(true);
  });

  it('when off: sends motion and the first zero, then stays silent', () => {
    expect(shouldPublish(false, false, false)).toBe(true); // moving
    expect(shouldPublish(true, false, false)).toBe(true); // released: first zero
    expect(shouldPublish(true, true, false)).toBe(false); // still centered
  });

  it('forced publishes (release) always go out', () => {
    expect(shouldPublish(true, true, false, true)).toBe(true);
  });
});
