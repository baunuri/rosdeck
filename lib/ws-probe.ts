export function probeWebSocket(host: string, port: number, timeoutMs = 2000, protocols?: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(`ws://${host}:${port}`, protocols);
    } catch {
      resolve(false);
      return;
    }
    const timeout = setTimeout(() => {
      ws.close();
      resolve(false);
    }, timeoutMs);
    ws.onopen = () => {
      clearTimeout(timeout);
      ws.close();
      resolve(true);
    };
    ws.onerror = () => {
      clearTimeout(timeout);
      resolve(false);
    };
  });
}
