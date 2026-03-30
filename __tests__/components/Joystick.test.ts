jest.mock('react-native', () => ({
  View: 'View',
  StyleSheet: { create: (s: Record<string, unknown>) => s },
  Platform: { OS: 'android', select: (obj: any) => obj.android || obj.default },
  Vibration: { vibrate: jest.fn() },
}));

jest.mock('react-native-gesture-handler', () => ({
  Gesture: { Pan: () => ({ onStart: jest.fn().mockReturnThis(), onUpdate: jest.fn().mockReturnThis(), onEnd: jest.fn().mockReturnThis() }) },
  GestureDetector: 'GestureDetector',
}));

jest.mock('react-native-reanimated', () => ({
  default: { View: 'Animated.View' },
  useSharedValue: jest.fn((v: number) => ({ value: v })),
  useAnimatedStyle: jest.fn((f: () => unknown) => f()),
  withSpring: jest.fn((v: number) => v),
}));

import { calculateVelocity } from '../../components/Joystick';

describe('calculateVelocity', () => {
  const maxLinear = 1.0;
  const maxAngular = 2.0;
  const radius = 60;

  it('returns zero velocity at center', () => {
    const { linearX, angularZ } = calculateVelocity(0, 0, radius, maxLinear, maxAngular);
    expect(linearX).toBe(0);
    expect(angularZ).toBe(0);
  });

  it('returns max linear velocity when pushed fully forward', () => {
    const { linearX, angularZ } = calculateVelocity(0, -radius, radius, maxLinear, maxAngular);
    expect(linearX).toBeCloseTo(maxLinear);
    expect(angularZ).toBeCloseTo(0);
  });

  it('returns negative linear velocity when pulled fully back', () => {
    const { linearX } = calculateVelocity(0, radius, radius, maxLinear, maxAngular);
    expect(linearX).toBeCloseTo(-maxLinear);
  });

  it('returns positive angular velocity when pushed fully left', () => {
    const { angularZ } = calculateVelocity(-radius, 0, radius, maxLinear, maxAngular);
    expect(angularZ).toBeCloseTo(maxAngular);
  });

  it('returns negative angular velocity when pushed fully right', () => {
    const { angularZ } = calculateVelocity(radius, 0, radius, maxLinear, maxAngular);
    expect(angularZ).toBeCloseTo(-maxAngular);
  });

  it('clamps to max values when pushed beyond radius', () => {
    const { linearX } = calculateVelocity(0, -radius * 2, radius, maxLinear, maxAngular);
    expect(linearX).toBe(maxLinear);
  });
});
