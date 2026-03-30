import React, { useState, useRef, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRosStore } from '../stores/useRosStore';
import { buildWebSocketUrl } from '../lib/ros';
import { useRouter } from 'expo-router';
import { theme } from '../constants/theme';
import { autoDetect, parseInput, type DetectionResult } from '../lib/auto-detect';

export function ConnectionForm() {
  const [ipPort, setIpPort] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [detectingHost, setDetectingHost] = useState('');
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [detectionFailed, setDetectionFailed] = useState(false);
  const [transportAutoSet, setTransportAutoSet] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const status = useRosStore((s) => s.connection.status);
  const transportType = useRosStore((s) => s.transportType);
  const setTransportType = useRosStore((s) => s.setTransportType);
  const router = useRouter();

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const handleConnect = () => {
    const url = detection ? detection.url : buildWebSocketUrl(ipPort.trim());
    useRosStore.getState().connectToUrl(url);
    router.push('/(tabs)/control');
  };

  const handleIpPortChange = (value: string) => {
    setIpPort(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    setDetection(null);
    setDetectionFailed(false);
    setTransportAutoSet(false);

    if (!value.trim()) return;

    debounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      const { host } = parseInput(value.trim());
      setDetectingHost(host);
      setDetecting(true);
      autoDetect(value.trim(), controller.signal)
        .then((result) => {
          if (!mountedRef.current || controller.signal.aborted) return;
          if (result) {
            setTransportType(result.transport);
            setDetection(result);
            setTransportAutoSet(true);
          } else {
            setDetectionFailed(true);
          }
        })
        .finally(() => {
          if (mountedRef.current) setDetecting(false);
        });
    }, 600);
  };

  const handleRetry = () => {
    abortRef.current?.abort();
    setDetection(null);
    setDetectionFailed(false);
    const { host } = parseInput(ipPort.trim());
    setDetectingHost(host);
    const controller = new AbortController();
    abortRef.current = controller;
    setDetecting(true);
    autoDetect(ipPort.trim(), controller.signal)
      .then((result) => {
        if (!mountedRef.current || controller.signal.aborted) return;
        if (result) {
          setTransportType(result.transport);
          setDetection(result);
          setTransportAutoSet(true);
        } else {
          setDetectionFailed(true);
        }
      })
      .finally(() => {
        if (mountedRef.current) setDetecting(false);
      });
  };

  const isConnecting = status === 'connecting';
  const isDisabled = !ipPort.trim() || isConnecting;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>ROBOT IP:PORT</Text>
      <TextInput
        style={styles.input}
        value={ipPort}
        onChangeText={handleIpPortChange}
        placeholder={transportType === 'foxglove' ? '192.168.1.50:8765' : '192.168.1.50:9090'}
        placeholderTextColor={theme.colors.textMuted}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.transportRow}>
        <TouchableOpacity
          style={[styles.transportOption, transportType === 'rosbridge' && styles.transportActive]}
          onPress={() => { setTransportType('rosbridge'); setTransportAutoSet(false); setDetectionFailed(false); }}
        >
          <Text style={[styles.transportText, transportType === 'rosbridge' && styles.transportTextActive]}>
            ROSBRIDGE
          </Text>
          {transportType === 'rosbridge' && transportAutoSet && (
            <Text style={styles.autoTag}>·AUTO</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.transportOption, transportType === 'foxglove' && styles.transportActive]}
          onPress={() => { setTransportType('foxglove'); setTransportAutoSet(false); setDetectionFailed(false); }}
        >
          <Text style={[styles.transportText, transportType === 'foxglove' && styles.transportTextActive]}>
            FOXGLOVE
          </Text>
          {transportType === 'foxglove' && transportAutoSet && (
            <Text style={styles.autoTag}>·AUTO</Text>
          )}
        </TouchableOpacity>
      </View>
      {detecting && (
        <View style={[styles.detectResult, styles.detectProbing]}>
          <ActivityIndicator size="small" color={theme.colors.textMuted} style={{ marginRight: 6 }} />
          <Text style={styles.detectProbingText}>Probing {detectingHost}…</Text>
        </View>
      )}
      {!detecting && detection !== null && (
        <View style={[styles.detectResult, styles.detectSuccess]}>
          <View style={[styles.dot, { backgroundColor: theme.colors.statusConnected }]} />
          <Text style={styles.detectSuccessText}>
            {detection.transport === 'rosbridge' ? 'Rosbridge' : 'Foxglove'} on {detection.host}:{detection.port}
          </Text>
          <TouchableOpacity onPress={handleRetry} style={styles.retryBtn}>
            <Ionicons name="refresh-outline" size={14} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}
      {!detecting && detectionFailed && (
        <View style={[styles.detectResult, styles.detectFailure]}>
          <View style={[styles.dot, { backgroundColor: theme.colors.statusError }]} />
          <Text style={styles.detectFailureText}>No bridge found — check IP and that rosbridge/foxglove is running</Text>
          <TouchableOpacity onPress={handleRetry} style={styles.retryBtn}>
            <Ionicons name="refresh-outline" size={14} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.buttons}>
        <TouchableOpacity
          style={[styles.button, styles.connectButton, isDisabled && styles.disabled]}
          onPress={handleConnect}
          disabled={isDisabled}
        >
          {isConnecting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.connectButtonText}>CONNECT</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  label: {
    ...theme.typography.label,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontFamily: 'SpaceMono',
    fontSize: 16,
    color: theme.colors.textValue,
  },
  transportRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  transportOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    borderRadius: theme.radius.md,
    paddingVertical: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  transportActive: {
    backgroundColor: theme.colors.accentPrimary,
    borderColor: theme.colors.accentPrimary,
  },
  transportText: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    color: theme.colors.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  transportTextActive: {
    color: '#FFFFFF',
  },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 12 },
  button: {
    flex: 1,
    padding: 14,
    borderRadius: theme.radius.md,
    alignItems: 'center' as const,
  },
  connectButton: {
    backgroundColor: theme.colors.accentPrimary,
  },
  connectButtonText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'SpaceMono',
    letterSpacing: 0.8,
    color: '#FFFFFF',
    textTransform: 'uppercase' as const,
  },
  disabled: { opacity: 0.35 },
  detectResult: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    padding: 10,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    marginTop: 8,
  },
  detectProbing: {
    backgroundColor: '#4A9EFF08',
    borderColor: '#4A9EFF20',
  },
  detectSuccess: {
    backgroundColor: '#34D39910',
    borderColor: '#34D39930',
  },
  detectFailure: {
    backgroundColor: '#EF444410',
    borderColor: '#EF444430',
  },
  detectProbingText: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    color: theme.colors.textMuted,
    flex: 1,
  },
  detectSuccessText: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    color: theme.colors.statusConnected,
    flex: 1,
  },
  detectFailureText: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    color: theme.colors.statusError,
    flex: 1,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  retryBtn: {
    padding: 2,
  },
  autoTag: {
    fontFamily: 'SpaceMono',
    fontSize: 9,
    color: '#34D399CC',
    letterSpacing: 0.4,
  },
});
