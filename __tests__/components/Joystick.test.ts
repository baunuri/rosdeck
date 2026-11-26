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

// calculateVelocity returns the stick deflection normalised to [-1, 1]: ny forward (+) / back,
// nx left (+) / right (ROS: +angular.z turns left). Scaling to m/s and rad/s happens in the widget.
describe('calculateVelocity', () => {
  const radius = 60;

  it('is zero at center', () => {
    expect(calculateVelocity(0, 0, radius)).toEqual({ nx: 0, ny: 0 });
  });

  it('is +1 forward when pushed fully up', () => {
    const { nx, ny } = calculateVelocity(0, -radius, radius);
    expect(ny).toBeCloseTo(1);
    expect(nx).toBeCloseTo(0);
  });

  it('is -1 forward when pulled fully back', () => {
    expect(calculateVelocity(0, radius, radius).ny).toBeCloseTo(-1);
  });

  it('is +1 sideways when pushed fully left', () => {
    expect(calculateVelocity(-radius, 0, radius).nx).toBeCloseTo(1);
  });

  it('is -1 sideways when pushed fully right', () => {
    expect(calculateVelocity(radius, 0, radius).nx).toBeCloseTo(-1);
  });

  it('clamps to the unit circle when pushed beyond the radius', () => {
    expect(calculateVelocity(0, -radius * 2, radius).ny).toBeCloseTo(1);
    const { nx, ny } = calculateVelocity(radius * 2, -radius * 2, radius);
    expect(Math.hypot(nx, ny)).toBeCloseTo(1);
  });
});
