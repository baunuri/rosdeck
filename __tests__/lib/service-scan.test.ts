import { scanServices, type ServiceScanResult } from '../../lib/service-scan';

// Mock WebSocket and fetch for controlled testing
global.WebSocket = jest.fn().mockImplementation((url: string) => {
  const ws: any = {
    close: jest.fn(),
    readyState: 0,
    onopen: null,
    onerror: null,
    onclose: null,
  };
  // Simulate: port 8765 open, others closed
  setTimeout(() => {
    if (url.includes(':8765')) {
      ws.readyState = 1;
      ws.onopen?.({});
    } else {
      ws.onerror?.({});
    }
  }, 10);
  return ws;
}) as any;

global.fetch = jest.fn().mockImplementation((url: string) => {
  if (url.includes(':8080')) {
    return Promise.resolve({ ok: true });
  }
  return Promise.reject(new Error('Connection refused'));
}) as any;

describe('scanServices', () => {
  it('returns results for all 3 services', async () => {
    const result = await scanServices('192.168.1.50');
    expect(result.services).toHaveLength(3);
    const names = result.services.map((s) => s.name);
    expect(names).toContain('Foxglove Bridge');
    expect(names).toContain('Rosbridge');
    expect(names).toContain('MJPEG Server');
  });

  it('marks found services correctly', async () => {
    const result = await scanServices('192.168.1.50');
    const foxglove = result.services.find((s) => s.name === 'Foxglove Bridge');
    expect(foxglove?.found).toBe(true);
  });

  it('marks not-found services correctly', async () => {
    const result = await scanServices('192.168.1.50');
    const rosbridge = result.services.find((s) => s.name === 'Rosbridge');
    expect(rosbridge?.found).toBe(false);
  });

  it('skips a port if provided in skipPort', async () => {
    const result = await scanServices('192.168.1.50', 8765);
    const foxglove = result.services.find((s) => s.name === 'Foxglove Bridge');
    expect(foxglove?.found).toBe(true);
    expect(foxglove?.skipped).toBe(true);
  });
});
