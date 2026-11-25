import { requireNativeViewManager } from 'expo-modules-core';
import React from 'react';
import { Platform, type ViewProps } from 'react-native';

export interface CompressedVideoViewRef {
  pushFrame(base64Data: string, presentationTimeUs: number): Promise<void>;
  reset(): Promise<void>;
}

interface NativeCompressedVideoProps extends ViewProps {
  format: string;
}

// ponytail: Android-only (MediaCodec); add an iOS VideoToolbox view when needed.
export const isCompressedVideoSupported = Platform.OS === 'android';

const NativeCompressedVideoView: React.ComponentType<
  NativeCompressedVideoProps & React.RefAttributes<CompressedVideoViewRef>
> | null = isCompressedVideoSupported ? requireNativeViewManager('ExpoCompressedVideo') : null;

export const CompressedVideoView = React.forwardRef<
  CompressedVideoViewRef,
  NativeCompressedVideoProps
>((props, ref) => (NativeCompressedVideoView ? <NativeCompressedVideoView {...props} ref={ref} /> : null));
