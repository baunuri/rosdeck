// components/WidgetContentWrapper.tsx
import React from 'react';
import { View } from 'react-native';
import { useOrientation } from '../hooks/useOrientation';

interface Props {
  width: number;
  height: number;
  children: React.ReactNode;
}

// Exported for testing
export function getContentDimensions(
  width: number, height: number, isLandscape: boolean
): { contentWidth: number; contentHeight: number } {
  if (!isLandscape) return { contentWidth: width, contentHeight: height };
  return { contentWidth: height, contentHeight: width };
}

export function WidgetContentWrapper({ width, height, children }: Props) {
  const { isLandscape } = useOrientation();

  if (!isLandscape) {
    return <View style={{ width, height }}>{children}</View>;
  }

  // Widget pane is portrait-shaped (width x height) due to grid rotation.
  // Content needs to appear landscape-shaped and upright.
  // Inner view is height x width (swapped), rotated +90deg to counter grid's -90deg.
  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <View
        style={{
          width: height,
          height: width,
          transform: [{ rotate: '90deg' }],
        }}
      >
        {children}
      </View>
    </View>
  );
}
