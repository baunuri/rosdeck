// lib/auto-detect.ts
import { probeWebSocket } from './ws-probe';
import { useRosStore } from '../stores/useRosStore';
import { RosbridgeTransport } from './rosbridge-transport';
import { FoxgloveTransport } from './foxglove-transport';

export type DetectionResult = {
  transport: 'rosbridge' | 'foxglove';
  url: string;
  host: string;
  port: number;
};

export function parseInput(input: string): { host: string; port: number | null } {
  // Strip ws:// or wss:// prefix
  let raw = input.replace(/^wss?:\/\//, '');
  // Split on last colon to separate host and optional port
  const lastColon = raw.lastIndexOf(':');
  if (lastColon === -1) {
    return { host: raw, port: null };
  }
  const maybePart = raw.slice(lastColon + 1);
  const portNum = parseInt(maybePart, 10);
  if (isNaN(portNum) || maybePart !== String(portNum)) {
    // Colon is part of host (e.g. IPv6 or no port present in unexpected form)
    return { host: raw, port: null };
  }
  return { host: raw.slice(0, lastColon), port: portNum };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer!));
}

export async function autoDetect(
  input: string,
  signal?: AbortSignal,
): Promise<DetectionResult | null> {
  if (signal?.aborted) return null;

  const { host, port } = parseInput(input.trim());
  if (!host || /\s/.test(host)) return null;

  // --- No port specified: probe :9090 and :8765 concurrently ---
  if (port === null) {
    const [ros9090, fox8765] = await Promise.all([
      probeWebSocket(host, 9090),
      probeWebSocket(host, 8765, 2000, ['foxglove.sdk.v1']),
    ]);
    if (signal?.aborted) return null;

    if (ros9090 && fox8765) {
      const current = useRosStore.getState().transportType;
      // 'foxglove' keeps foxglove; anything else (including 'demo', 'rosbridge', unknown) defaults to rosbridge
      const preferred = current === 'foxglove' ? 'foxglove' : 'rosbridge';
      const p = preferred === 'foxglove' ? 8765 : 9090;
      return { transport: preferred, url: `ws://${host}:${p}`, host, port: p };
    }
    if (ros9090) return { transport: 'rosbridge', url: `ws://${host}:9090`, host, port: 9090 };
    if (fox8765) return { transport: 'foxglove', url: `ws://${host}:8765`, host, port: 8765 };
    return null;
  }

  // --- Port 9090: rosbridge ---
  if (port === 9090) {
    if (signal?.aborted) return null;
    const ok = await probeWebSocket(host, 9090);
    if (signal?.aborted) return null;
    return ok ? { transport: 'rosbridge', url: `ws://${host}:9090`, host, port: 9090 } : null;
  }

  // --- Port 8765: foxglove ---
  if (port === 8765) {
    if (signal?.aborted) return null;
    const ok = await probeWebSocket(host, 8765, 2000, ['foxglove.sdk.v1']);
    if (signal?.aborted) return null;
    return ok ? { transport: 'foxglove', url: `ws://${host}:8765`, host, port: 8765 } : null;
  }

  // --- Other port: raw probe then sequential transport handshake ---
  if (signal?.aborted) return null;
  const reachable = await probeWebSocket(host, port);
  if (signal?.aborted) return null;
  if (!reachable) return null;

  const url = `ws://${host}:${port}`;

  // Try rosbridge first
  {
    const t = new RosbridgeTransport();
    try {
      await withTimeout(t.connect(url), 2000);
      t.disconnect();
      if (signal?.aborted) return null;
      return { transport: 'rosbridge', url, host, port };
    } catch {
      t.disconnect();
    }
  }
  if (signal?.aborted) return null;

  // Try foxglove second
  {
    const t = new FoxgloveTransport();
    try {
      await withTimeout(t.connect(url), 2000);
      t.disconnect();
      if (signal?.aborted) return null;
      return { transport: 'foxglove', url, host, port };
    } catch {
      t.disconnect();
    }
  }

  return null;
}
