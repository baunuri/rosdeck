import { DEFAULTS } from '../constants/defaults';
import { probeWebSocket } from './ws-probe';

export interface ServiceInfo {
  name: string;
  port: number;
  found: boolean;
  skipped?: boolean;
}

export interface ServiceScanResult {
  services: ServiceInfo[];
  mjpegHost?: string;
}

const SERVICES = [
  { name: 'Foxglove Bridge', port: DEFAULTS.foxglovePort, protocol: 'ws' },
  { name: 'Rosbridge', port: DEFAULTS.rosbridgePort, protocol: 'ws' },
  { name: 'MJPEG Server', port: DEFAULTS.mjpegPort, protocol: 'http' },
] as const;

const SCAN_TIMEOUT_MS = 2000;

function probeHttp(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), SCAN_TIMEOUT_MS);
    fetch(`http://${host}:${port}`, { method: 'HEAD' })
      .then(() => {
        clearTimeout(timeout);
        resolve(true);
      })
      .catch(() => {
        clearTimeout(timeout);
        resolve(false);
      });
  });
}

export async function scanServices(host: string, skipPort?: number): Promise<ServiceScanResult> {
  const results = await Promise.all(
    SERVICES.map(async (service) => {
      if (service.port === skipPort) {
        return { name: service.name, port: service.port, found: true, skipped: true };
      }
      const found =
        service.protocol === 'ws'
          ? await probeWebSocket(host, service.port)
          : await probeHttp(host, service.port);
      return { name: service.name, port: service.port, found };
    })
  );

  const mjpeg = results.find((r) => r.name === 'MJPEG Server' && r.found);

  return {
    services: results,
    mjpegHost: mjpeg ? host : undefined,
  };
}
