import { Ionicons } from "@expo/vector-icons";
import type { SkImage } from "@shopify/react-native-skia";
import { Canvas, Skia, Image as SkiaImage } from "@shopify/react-native-skia";
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { DEFAULTS } from "../constants/defaults";
import { theme } from "../constants/theme";
import { buildMjpegUrl, parseRobotIp } from "../lib/ros";
import { useRosStore } from "../stores/useRosStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import type { WidgetProps } from "../types/layout";
import { WidgetEmptyState } from "./WidgetEmptyState";

// Max compressed image size: 2MB. Anything larger is likely raw image data
// that slipped through, or a corrupt message.
const MAX_COMPRESSED_SIZE = 2 * 1024 * 1024;

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

  // Auto-detect a CompressedImage topic when the configured topic has no data
  const autoDetectTopics = useSettingsStore((s) => s.autoDetectTopics);
  useEffect(() => {
    if (!autoDetectTopics) return;
    if (cameraSource === "mjpeg" || !transport || status !== "connected") return;
    if (!showEmptyState || hasReceivedFrame.current) return;

    transport.getTopics().then((topics) => {
      const compressed = topics.find(
        (t) =>
          t.type === "sensor_msgs/msg/CompressedImage" &&
          t.name !== cameraTopic,
      );
      if (compressed && props?.onConfigChange) {
        props.onConfigChange({ ...props.config, topic: compressed.name });
      }
    });
  }, [showEmptyState, status, cameraSource, autoDetectTopics]);

  // Subscribe to image topic via transport (throttled to ~10fps).
  // First verify the topic actually publishes CompressedImage — subscribing to a
  // raw Image topic would flood the websocket with multi-MB frames and freeze the app.
  const [verifiedTopic, setVerifiedTopic] = useState<string | null>(null);

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
      if (match && /CompressedImage/.test(match.type)) {
        setVerifiedTopic(cameraTopic);
      } else {
        setVerifiedTopic(null);
      }
    });
    return () => { cancelled = true; };
  }, [transport, cameraTopic, cameraSource, status, url]);

  useEffect(() => {
    if (!verifiedTopic || cameraSource === "mjpeg" || !transport || status !== "connected")
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
          setShowEmptyState(false);
        }
      }
    };

    const sub = transport.subscribe(
      verifiedTopic,
      "sensor_msgs/msg/CompressedImage",
      (msg: any) => {
        // Drop raw Image messages (have encoding/width/height fields)
        // and anything without compressed data
        if (!msg.data || msg.encoding || msg.width || msg.height) return;

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

    return () => {
      sub.unsubscribe();
      if (rafId !== null) cancelAnimationFrame(rafId);
      pendingData = null;
      setCurrentFrame((prev) => {
        prev?.dispose();
        return null;
      });
    };
  }, [verifiedTopic, transport, cameraSource, status, url, maxFps]);

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
          hint="Topic not found or not a CompressedImage topic. Use image_transport to republish as compressed."
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
          hint="Is the topic publishing sensor_msgs/CompressedImage?"
        />
      </View>
    );
  }

  const width = props?.width || 320;
  const height = props?.height || 240;

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
