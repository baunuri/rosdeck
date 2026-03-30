// lib/demo-transport.ts
import type {
  Subscription,
  TopicInfo,
  Transport,
  TransportStatus,
} from "./transport";

const DEMO_TOPICS: TopicInfo[] = [
  { name: "/cmd_vel", type: "geometry_msgs/msg/Twist" },
  { name: "/camera/image_raw", type: "sensor_msgs/msg/Image" },
  { name: "/map", type: "nav_msgs/msg/OccupancyGrid" },
  { name: "/diagnostics", type: "diagnostic_msgs/msg/DiagnosticArray" },
  { name: "/scan", type: "sensor_msgs/msg/LaserScan" },
  { name: "/battery_state", type: "sensor_msgs/msg/BatteryState" },
  { name: "/odom", type: "nav_msgs/msg/Odometry" },
  { name: '/imu/data', type: 'sensor_msgs/msg/Imu' },
  { name: '/imu/mag', type: 'sensor_msgs/msg/MagneticField' },
];

export class DemoTransport implements Transport {
  private status: TransportStatus = "disconnected";
  private statusCallbacks: Array<
    (status: TransportStatus, error?: string) => void
  > = [];
  private timers: ReturnType<typeof setInterval>[] = [];
  private mapDataCache: number[] | null = null;

  private buildDemoMapData(): number[] {
    if (this.mapDataCache) return this.mapDataCache;
    const W = 200,
      H = 200;
    const data = new Array(W * H).fill(0);

    const fill = (x1: number, y1: number, x2: number, y2: number) => {
      for (let y = Math.max(0, y1); y <= Math.min(H - 1, y2); y++)
        for (let x = Math.max(0, x1); x <= Math.min(W - 1, x2); x++)
          data[y * W + x] = 100;
    };

    // Outer walls
    fill(0, 0, W - 1, 1);
    fill(0, H - 2, W - 1, H - 1);
    fill(0, 0, 1, H - 1);
    fill(W - 2, 0, W - 1, H - 1);

    // Room A — bottom-left. Right wall has door gap at y 30–45, top wall at y=62
    fill(2, 62, 54, 63); // top wall
    fill(54, 2, 55, 29); // right wall south of door
    fill(54, 46, 55, 62); // right wall north of door
    fill(7, 6, 32, 8); // furniture: table
    fill(7, 6, 9, 28); // furniture: cabinet side
    fill(36, 22, 52, 24); // furniture: shelf
    fill(50, 24, 52, 55); // furniture: wall unit

    // Room B — bottom-right. Left wall has door gap at y 30–45, top wall at y=62
    fill(145, 62, 197, 63);
    fill(145, 2, 146, 29);
    fill(145, 46, 146, 62);
    fill(168, 6, 193, 8);
    fill(191, 6, 193, 28);
    fill(148, 22, 164, 24);
    fill(148, 24, 150, 55);

    // Room C — top-left. Right wall has door gap at y 155–170, bottom wall at y=136
    fill(2, 136, 54, 137);
    fill(54, 137, 55, 154);
    fill(54, 171, 55, 197);
    fill(7, 160, 32, 162);
    fill(7, 162, 9, 190);
    fill(36, 148, 52, 150);
    fill(50, 137, 52, 148);

    // Room D — top-right. Left wall has door gap at y 155–170, bottom wall at y=136
    fill(145, 136, 197, 137);
    fill(145, 137, 146, 154);
    fill(145, 171, 146, 197);
    fill(168, 160, 193, 162);
    fill(191, 162, 193, 190);
    fill(148, 148, 164, 150);
    fill(148, 137, 150, 148);

    // Internal corridor walls creating a cross-junction
    // South pinch (y=63–65): gap at x 90–110
    fill(55, 63, 89, 65);
    fill(111, 63, 145, 65);
    // North pinch (y=135–137): gap at x 90–110
    fill(55, 135, 89, 137);
    fill(111, 135, 145, 137);
    // West pinch (x=55–57): gap at y 90–110
    fill(55, 65, 57, 89);
    fill(55, 111, 57, 135);
    // East pinch (x=143–145): gap at y 90–110
    fill(143, 65, 145, 89);
    fill(143, 111, 145, 135);

    this.mapDataCache = data;
    return data;
  }

  async connect(_url: string): Promise<void> {
    this.status = "connected";
    this.statusCallbacks.forEach((cb) => cb("connected", undefined));
  }

  disconnect(): void {
    this.timers.forEach((t) => clearInterval(t));
    this.timers = [];
    this.status = "disconnected";
    this.statusCallbacks.forEach((cb) => cb("disconnected", undefined));
  }

  subscribe(
    topic: string,
    _messageType: string,
    callback: (msg: any) => void,
    throttleRate?: number,
  ): Subscription {
    const interval = setInterval(
      () => callback(this.buildDemoMessage(topic)),
      throttleRate || 100,
    );
    this.timers.push(interval);
    // Deliver first message immediately
    setTimeout(() => callback(this.buildDemoMessage(topic)), 50);
    return {
      unsubscribe: () => {
        clearInterval(interval);
        this.timers = this.timers.filter((t) => t !== interval);
      },
    };
  }

  publish(_topic: string, _messageType: string, _msg: any): void {
    // No-op in demo mode
  }

  async getTopics(): Promise<TopicInfo[]> {
    return DEMO_TOPICS;
  }

  onStatus(
    callback: (status: TransportStatus, error?: string) => void,
  ): () => void {
    this.statusCallbacks.push(callback);
    return () => {
      this.statusCallbacks = this.statusCallbacks.filter(
        (cb) => cb !== callback,
      );
    };
  }

  getStatus(): TransportStatus {
    return this.status;
  }

  private buildDemoMessage(topic: string): any {
    switch (topic) {
      case "/map":
        return {
          info: {
            resolution: 0.05,
            width: 200,
            height: 200,
            origin: {
              position: { x: -5, y: -5, z: 0 },
              orientation: { x: 0, y: 0, z: 0, w: 1 },
            },
          },
          data: this.buildDemoMapData(),
        };
      case "/diagnostics":
        return {
          status: [
            {
              name: "Battery",
              message: "OK",
              level: 0,
              values: [{ key: "voltage", value: "12.4V" }],
            },
            { name: "Motors", message: "Running", level: 0, values: [] },
          ],
        };
      case "/scan":
        return {
          angle_min: -1.57,
          angle_max: 1.57,
          angle_increment: 0.0175,
          ranges: Array(180)
            .fill(0)
            .map((_, i) => 2 + Math.sin(i * 0.1)),
        };
      case "/camera/image_raw":
        return {
          width: 320,
          height: 240,
          encoding: "rgb8",
          data: Array(320 * 240 * 3).fill(128),
        };
      case "/battery_state": {
        const t2 = Date.now() / 1000;
        return {
          voltage: 12.4 + Math.sin(t2 * 0.1) * 0.3,
          current: -1.2 + Math.sin(t2 * 0.4) * 0.2,
          charge: 8.5 + Math.sin(t2 * 0.05) * 0.3,
          capacity: 10.0,
          percentage: 0.85 + Math.sin(t2 * 0.07) * 0.05,
          power_supply_status: 2,
          present: true,
        };
      }
      case "/odom": {
        const t3 = Date.now() / 1000;
        return {
          pose: {
            pose: {
              position: {
                x: Math.sin(t3 * 0.3) * 2,
                y: Math.cos(t3 * 0.2) * 1.5,
                z: 0,
              },
              orientation: {
                x: 0,
                y: 0,
                z: Math.sin(t3 * 0.15),
                w: Math.cos(t3 * 0.15),
              },
            },
          },
          twist: {
            twist: {
              linear: { x: Math.cos(t3 * 0.3) * 0.6, y: 0, z: 0 },
              angular: { x: 0, y: 0, z: Math.sin(t3 * 0.5) * 0.3 },
            },
          },
        };
      }
      case '/imu/data': {
        const t = Date.now() / 1000;
        // Gentle rocking: ±8° roll, ±4° pitch, slow yaw rotation
        const rollRad = (8 * Math.PI / 180) * Math.sin(t * 0.7);
        const pitchRad = (4 * Math.PI / 180) * Math.sin(t * 0.5);
        const yawRad = t * 0.15; // slow continuous rotation

        // Euler to quaternion (ZYX convention)
        const cr = Math.cos(rollRad / 2), sr = Math.sin(rollRad / 2);
        const cp = Math.cos(pitchRad / 2), sp = Math.sin(pitchRad / 2);
        const cy = Math.cos(yawRad / 2), sy = Math.sin(yawRad / 2);

        return {
          orientation: {
            x: sr * cp * cy - cr * sp * sy,
            y: cr * sp * cy + sr * cp * sy,
            z: cr * cp * sy - sr * sp * cy,
            w: cr * cp * cy + sr * sp * sy,
          },
          angular_velocity: {
            x: 0.7 * (8 * Math.PI / 180) * Math.cos(t * 0.7),
            y: 0.5 * (4 * Math.PI / 180) * Math.cos(t * 0.5),
            z: 0.15,
          },
          linear_acceleration: {
            x: 0.15 * Math.sin(t * 1.2),
            y: -0.08 * Math.cos(t * 0.9),
            z: 9.81 + 0.1 * Math.sin(t * 2.0),
          },
        };
      }
      case '/imu/mag': {
        const t = Date.now() / 1000;
        const yawRad = t * 0.15; // match IMU yaw
        // Synthetic magnetic field: ~25μT pointing north, rotated by yaw
        return {
          magnetic_field: {
            x: 25e-6 * Math.cos(yawRad),
            y: 25e-6 * Math.sin(yawRad),
            z: -45e-6, // vertical component (typical for mid-latitudes)
          },
        };
      }
      default:
        return {};
    }
  }
}
