import { Ionicons } from "@expo/vector-icons";
import type { SkImage } from "@shopify/react-native-skia";
import { Canvas, Skia, Image as SkiaImage } from "@shopify/react-native-skia";
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { DEFAULTS } from "../constants/defaults";
import { theme } from "../constants/theme";
import { buildMjpegUrl, parseRobotIp } from "../lib/ros";
import { detectVideoCodec } from "../lib/video-codec";
import { useRosStore } from "../stores/useRosStore";
import type { WidgetProps } from "../types/layout";
import { WidgetEmptyState } from "./WidgetEmptyState";
import {
  CompressedVideoView,
  isCompressedVideoSupported,
  type CompressedVideoViewRef,
} from "../modules/expo-compressed-video/src";

const COMPRESSED_IMAGE = 'sensor_msgs/msg/CompressedImage';
const COMPRESSED_VIDEO = 'foxglove_msgs/msg/CompressedVideo';
const VIDEO_FORMATS = new Set(['h264', 'h265', 'hevc', 'vp9', 'av1']);

// Max compressed image size: 2MB. Anything larger is likely raw image data
// that slipped through, or a corrupt message.
const MAX_COMPRESSED_SIZE = 2 * 1024 * 1024;

/**
 * Check if a topic is a standard compressed camera image we can decode.
 * Only allows topics whose name ends with /compressed (the standard
 * image_transport convention) or whose name contains "compressed" but not
 * any known non-JPEG variants (depth, theora, zstd, etc.).
 *
 * Allowlist approach: safer than trying to exclude every variant.
 */
function isCameraImageTopic(topicName: string, topicType: string): boolean {
  if (topicType !== 'sensor_msgs/msg/CompressedImage') return false;
  // Standard image_transport compressed topic: /foo/compressed
  if (topicName.endsWith('/compressed')) return true;
  // Reject known non-JPEG variants by name
  if (/[Dd]epth|theora|zstd|h264|h265|hevc|avif|svt/.test(topicName)) return false;
  // Allow other CompressedImage topics (e.g., /camera/compressed_image)
  return true;
}

function toBytes(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof data === 'string' && data) {
    // rosbridge sends uint8[] as base64
    return Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  }
  return null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  // Small chunks: Hermes throws RangeError when spreading ~32k arguments.
  for (let offset = 0; offset < bytes.length; offset += 0x1000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x1000));
  }
  return btoa(binary);
}

const DEBUG_CAMERA = __DEV__;
function cameraLog(...args: any[]) {
  if (DEBUG_CAMERA) console.log('[CameraFeed]', ...args);
}

// Minimum size: a valid JPEG/PNG header is at least a few bytes
const MIN_IMAGE_SIZE = 8;

/**
 * Validate that bytes start with a known image format magic signature.
 * Returns false for raw pixel data, corrupt data, or unknown formats.
 */
function isKnownImageFormat(bytes: Uint8Array): boolean {
  if (bytes.length < MIN_IMAGE_SIZE) return false;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return true;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return true;
  // WebP: RIFF....WEBP
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return true;
  // BMP: 42 4D
  if (bytes[0] === 0x42 && bytes[1] === 0x4D) return true;
  return false;
}

/**
 * Decode CompressedImage data into a Skia SkImage.
 * - Rosbridge: msg.data is base64 string → decode to bytes → Skia
 * - Foxglove: msg.data is Uint8Array (raw JPEG) → Skia directly
 *
 * Validates magic bytes before attempting decode to avoid passing
 * raw pixel data or garbage to Skia.
 */
function decodeToSkImage(data: any): SkImage | null {
  try {
    let bytes: Uint8Array;
    if (data instanceof Uint8Array) {
      bytes = data;
    } else if (data instanceof ArrayBuffer) {
      bytes = new Uint8Array(data);
    } else if (typeof data === "string") {
      if (data.length === 0) return null;
      // Base64 string from rosbridge — decode to bytes
      const raw = atob(data);
      bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        bytes[i] = raw.charCodeAt(i);
      }
    } else {
      return null;
    }
    if (bytes.length < MIN_IMAGE_SIZE || bytes.length > MAX_COMPRESSED_SIZE) return null;
    if (!isKnownImageFormat(bytes)) return null;
    const skData = Skia.Data.fromBytes(bytes);
    return Skia.Image.MakeImageFromEncoded(skData);
  } catch {
    return null;
  }
}

export function CameraFeed(props?: Partial<WidgetProps>) {
  const cameraSource = props?.config?.source || "transport";
  const cameraTopic = props?.config?.topic || DEFAULTS.cameraTopic;
  const mjpegPort = props?.config?.mjpegPort || DEFAULTS.mjpegPort;
  const maxFps = props?.config?.maxFps ?? 10;
  const transport = useRosStore((s) => s.transport);
  const url = useRosStore((s) => s.connection.url);
  const status = useRosStore((s) => s.connection.status);

  const [mjpegError, setMjpegError] = useState(false);
  const [fps, setFps] = useState(0);
  const [showEmptyState, setShowEmptyState] = useState(false);
  const [currentFrame, setCurrentFrame] = useState<SkImage | null>(null);
  const frameCount = useRef(0);
  const hasReceivedFrame = useRef(false);
  const videoViewRef = useRef<CompressedVideoViewRef>(null);
  const [videoFormat, setVideoFormat] = useState('h265');

  const robotIp = parseRobotIp(url);

  // FPS counter for transport mode
  useEffect(() => {
    if (cameraSource !== "mjpeg" && status === "connected") {
      const interval = setInterval(() => {
        setFps(frameCount.current);
        frameCount.current = 0;
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [cameraSource, status]);

  // Empty state timer
  useEffect(() => {
    if (status !== "connected") {
      setShowEmptyState(false);
      return;
    }
    if (cameraSource === "mjpeg" && mjpegError) {
      const timer = setTimeout(() => setShowEmptyState(true), 3000);
      return () => clearTimeout(timer);
    }
    if (cameraSource !== "mjpeg") {
      hasReceivedFrame.current = false;
      const timer = setTimeout(() => {
        if (!hasReceivedFrame.current) setShowEmptyState(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [status, cameraSource, mjpegError]);


  // Subscribe to image topic via transport (throttled to ~10fps).
  // First verify the topic actually publishes CompressedImage — subscribing to a
  // raw Image topic would flood the websocket with multi-MB frames and freeze the app.
  const [verifiedTopic, setVerifiedTopic] = useState<{ name: string; type: string } | null>(null);

  useEffect(() => {
    if (cameraSource === "mjpeg" || !transport || status !== "connected") {
      setVerifiedTopic(null);
      return;
    }
    if (url?.startsWith("demo://")) return;

    let cancelled = false;
    transport.getTopics().then((topics) => {
      if (cancelled) return;
      const match = topics.find((t) => t.name === cameraTopic);
      if (match && (isCameraImageTopic(match.name, match.type) || match.type === COMPRESSED_VIDEO)) {
        cameraLog('Verified topic:', cameraTopic, '→', match.type);
        setVerifiedTopic({ name: match.name, type: match.type });
      } else {
        cameraLog('Rejected topic:', cameraTopic, match ? `(type: ${match.type})` : '(not found)');
        setVerifiedTopic(null);
      }
    });
    return () => { cancelled = true; };
  }, [transport, cameraTopic, cameraSource, status, url]);

  useEffect(() => {
    if (!verifiedTopic || verifiedTopic.type !== COMPRESSED_IMAGE ||
        cameraSource === "mjpeg" || !transport || status !== "connected")
      return;
    if (url?.startsWith("demo://")) return;

    const MIN_FRAME_INTERVAL_MS = Math.round(1000 / maxFps);
    let lastFrameTime = 0;
    let decoding = false;
    let pendingData: any = null;
    let rafId: number | null = null;

    const processFrame = () => {
      rafId = null;
      const data = pendingData;
      pendingData = null;
      if (!data || decoding) return;

      decoding = true;
      const image = decodeToSkImage(data);
      decoding = false;

      if (image) {
        setCurrentFrame((prev) => {
          prev?.dispose();
          return image;
        });
        frameCount.current++;
        if (!hasReceivedFrame.current) {
          hasReceivedFrame.current = true;
          cameraLog('First frame decoded successfully');
          setShowEmptyState(false);
        }
      } else {
        decodeFailCount++;
        if (decodeFailCount <= 3) {
          const size = data instanceof Uint8Array ? data.length
            : typeof data === 'string' ? data.length
            : '?';
          cameraLog('Decode failed, data size:', size,
            'type:', typeof data,
            data instanceof Uint8Array ? `magic: ${[...data.slice(0, 4)].map(b => b.toString(16).padStart(2, '0')).join(' ')}` : '');
        }
      }
    };

    cameraLog('Subscribing to', verifiedTopic.name, 'at', maxFps, 'fps max');
    let msgCount = 0;
    let dropCount = 0;
    let decodeFailCount = 0;

    const sub = transport.subscribe(
      verifiedTopic.name,
      COMPRESSED_IMAGE,
      (msg: any) => {
        msgCount++;
        // Drop raw Image messages (have encoding/width/height fields)
        // and anything without compressed data
        if (!msg.data || msg.encoding || msg.width || msg.height) {
          dropCount++;
          if (dropCount <= 3) {
            cameraLog('Dropped msg #' + msgCount + ': raw image fields detected',
              { hasData: !!msg.data, encoding: msg.encoding, width: msg.width, height: msg.height,
                format: msg.format, keys: Object.keys(msg).join(',') });
          }
          return;
        }

        const now = Date.now();
        if (now - lastFrameTime < MIN_FRAME_INTERVAL_MS) return;
        lastFrameTime = now;

        pendingData = msg.data;
        if (rafId === null) {
          rafId = requestAnimationFrame(processFrame);
        }
      },
      MIN_FRAME_INTERVAL_MS,
    );

    // Periodic stats log
    const statsInterval = setInterval(() => {
      if (msgCount > 0) {
        cameraLog(`Stats: ${msgCount} msgs, ${dropCount} dropped, ${decodeFailCount} decode fails, ${frameCount.current} rendered`);
        msgCount = 0;
        dropCount = 0;
        decodeFailCount = 0;
      }
    }, 5000);

    return () => {
      cameraLog('Unsubscribing from', verifiedTopic.name);
      sub.unsubscribe();
      clearInterval(statsInterval);
      if (rafId !== null) cancelAnimationFrame(rafId);
      pendingData = null;
      setCurrentFrame((prev) => {
        prev?.dispose();
        return null;
      });
    };
  }, [verifiedTopic, transport, cameraSource, status, url, maxFps]);

  // foxglove_msgs/CompressedVideo: one Annex-B packet per message. Every frame is
  // forwarded (no FPS throttling) or the decoder loses its reference frames.
  useEffect(() => {
    if (!verifiedTopic || verifiedTopic.type !== COMPRESSED_VIDEO || !isCompressedVideoSupported ||
        cameraSource === 'mjpeg' || !transport || status !== 'connected') return;
    let active = true;
    const sub = transport.subscribe(verifiedTopic.name, COMPRESSED_VIDEO, (msg: any) => {
      if (!active) return;
      const declared = String(msg?.format || '').toLowerCase();
      if (!VIDEO_FORMATS.has(declared)) return;
      const bytes = toBytes(msg?.data);
      if (!bytes || bytes.length === 0) return;
      // Trust the bitstream over the label; delta frames keep the last detected codec.
      const detected = detectVideoCodec(bytes);
      if (detected) setVideoFormat(detected);
      else if (declared !== 'h264' && declared !== 'h265' && declared !== 'hevc') setVideoFormat(declared);
      let encoded: string;
      try {
        encoded = toBase64(bytes);
      } catch (error) {
        cameraLog('Video frame encode failed:', error); // transport swallows callback errors
        return;
      }
      const stamp = msg.timestamp || {};
      const presentationTimeUs = Number(stamp.sec || 0) * 1_000_000 +
        Number(stamp.nsec ?? stamp.nanosec ?? 0) / 1_000;
      videoViewRef.current?.pushFrame(encoded, presentationTimeUs || Date.now() * 1_000)
        .catch((error) => cameraLog('Native video frame rejected:', error));
      frameCount.current++;
      if (!hasReceivedFrame.current) {
        hasReceivedFrame.current = true;
        setShowEmptyState(false);
      }
    });
    return () => {
      active = false;
      sub.unsubscribe();
      videoViewRef.current?.reset().catch(() => {});
    };
  }, [verifiedTopic, transport, cameraSource, status]);

  // --- Not connected ---
  if (status !== "connected") {
    return (
      <View style={styles.container}>
        <View style={styles.placeholderContent}>
          <Ionicons
            name="videocam-off-outline"
            size={40}
            color={theme.colors.textMuted}
          />
          <Text style={styles.placeholder}>
            Connect to a robot to view camera feed
          </Text>
        </View>
      </View>
    );
  }

  // --- Demo mode ---
  if (url?.startsWith("demo://")) {
    return (
      <View style={styles.container}>
        <View style={styles.demoCamera}>
          <Ionicons
            name="videocam-outline"
            size={48}
            color={theme.colors.textMuted}
          />
          <Text style={styles.demoCameraText}>CAMERA PREVIEW</Text>
          <Text style={styles.demoCameraHint}>{cameraTopic}</Text>
        </View>
      </View>
    );
  }

  // --- MJPEG mode (needs web_video_server, works with any transport) ---
  if (cameraSource === "mjpeg") {
    if (mjpegError) {
      return (
        <View style={styles.container}>
          <WidgetEmptyState widgetType="camera" topicName={cameraTopic} />
        </View>
      );
    }
    const mjpegUrl = buildMjpegUrl(robotIp, mjpegPort, cameraTopic);
    const mjpegHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { margin: 0; background: #000; display: flex; align-items: center; justify-content: center; height: 100vh; overflow: hidden; }
          img { max-width: 100%; max-height: 100%; object-fit: contain; }
        </style>
      </head>
      <body>
        <img src="${mjpegUrl}" onerror="window.ReactNativeWebView.postMessage('error')" />
      </body>
      </html>
    `;
    return (
      <View style={styles.container}>
        <WebView
          source={{ html: mjpegHtml }}
          style={styles.webview}
          javaScriptEnabled
          scrollEnabled={false}
          onError={() => setMjpegError(true)}
          onMessage={(e) => { if (e.nativeEvent.data === 'error') setMjpegError(true); }}
        />
      </View>
    );
  }

  // --- Transport mode (subscribe via transport, render with Skia) ---

  if (!verifiedTopic && status === "connected" && cameraSource !== "mjpeg") {
    return (
      <View style={styles.container}>
        <WidgetEmptyState
          widgetType="camera"
          topicName={cameraTopic}
          hint="Topic not found or not a CompressedImage/CompressedVideo topic. Use image_transport to republish as compressed."
        />
      </View>
    );
  }

  if (verifiedTopic?.type === COMPRESSED_VIDEO && !isCompressedVideoSupported) {
    return (
      <View style={styles.container}>
        <WidgetEmptyState
          widgetType="camera"
          topicName={cameraTopic}
          hint="H.264/H.265 video is Android-only for now. Pick a CompressedImage topic."
        />
      </View>
    );
  }

  if (showEmptyState && !hasReceivedFrame.current) {
    return (
      <View style={styles.container}>
        <WidgetEmptyState
          widgetType="camera"
          topicName={cameraTopic}
          hint="Is the topic publishing CompressedImage or foxglove_msgs/CompressedVideo?"
        />
      </View>
    );
  }

  const width = props?.width || 320;
  const height = props?.height || 240;

  if (verifiedTopic?.type === COMPRESSED_VIDEO) {
    return (
      <View style={styles.container}>
        <CompressedVideoView ref={videoViewRef} format={videoFormat} style={styles.canvas} />
        <View style={styles.fpsOverlay}>
          <Text style={styles.fpsText}>{fps} FPS</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Canvas style={styles.canvas}>
        {currentFrame && (
          <SkiaImage
            image={currentFrame}
            x={0}
            y={0}
            width={width}
            height={height}
            fit="contain"
          />
        )}
      </Canvas>
      <View style={styles.fpsOverlay}>
        <Text style={styles.fpsText}>{fps} FPS</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
    overflow: "hidden",
  },
  canvas: { flex: 1 },
  webview: { flex: 1 },
  placeholderContent: {
    flex: 1,
    backgroundColor: theme.colors.bgInset,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    color: theme.colors.textMuted,
    textAlign: "center",
    marginTop: 12,
    fontSize: 14,
  },
  fpsOverlay: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "#00000099",
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  fpsText: {
    fontFamily: "SpaceMono",
    fontSize: 12,
    color: theme.colors.statusConnected,
  },
  demoCamera: {
    flex: 1,
    backgroundColor: theme.colors.bgInset,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
  },
  demoCameraText: {
    fontFamily: "SpaceMono",
    fontSize: 12,
    fontWeight: "700" as const,
    color: theme.colors.textSecondary,
    letterSpacing: 0.8,
  },
  demoCameraHint: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    color: theme.colors.textMuted,
  },
});
