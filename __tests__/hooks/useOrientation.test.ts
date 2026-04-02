// __tests__/hooks/useOrientation.test.ts
jest.mock('react-native', () => ({
  useWindowDimensions: jest.fn(() => ({ width: 390, height: 844 })),
}));

import { getOrientationInfo } from '../../hooks/useOrientation';

describe('getOrientationInfo', () => {
  it('detects portrait when height > width', () => {
    const result = getOrientationInfo(390, 844);
    expect(result.isLandscape).toBe(false);
    expect(result.orientation).toBe('portrait');
    expect(result.screenWidth).toBe(390);
    expect(result.screenHeight).toBe(844);
  });

  it('detects landscape when width > height', () => {
    const result = getOrientationInfo(844, 390);
    expect(result.isLandscape).toBe(true);
    expect(result.orientation).toBe('landscape');
    expect(result.screenWidth).toBe(844);
    expect(result.screenHeight).toBe(390);
  });

  it('treats square as portrait', () => {
    const result = getOrientationInfo(400, 400);
    expect(result.isLandscape).toBe(false);
  });
});
