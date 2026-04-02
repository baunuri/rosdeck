// hooks/useOrientation.ts
import { useWindowDimensions } from 'react-native';

export interface OrientationInfo {
  isLandscape: boolean;
  orientation: 'portrait' | 'landscape';
  screenWidth: number;
  screenHeight: number;
}

export function getOrientationInfo(width: number, height: number): OrientationInfo {
  const isLandscape = width > height;
  return {
    isLandscape,
    orientation: isLandscape ? 'landscape' : 'portrait',
    screenWidth: width,
    screenHeight: height,
  };
}

export function useOrientation(): OrientationInfo {
  const { width, height } = useWindowDimensions();
  return getOrientationInfo(width, height);
}
