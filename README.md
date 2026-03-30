<p align="center">
  <img src="assets/images/icon.png" width="120" alt="ROSDeck icon" />
</p>

<h1 align="center">ROSDeck</h1>

<p align="center">
  A mobile dashboard for ROS2 robots.<br/>
  Connect over WiFi, add widgets, control everything from your phone.<br/>
  <a href="https://rosdeck.github.io">Sign up for the beta</a> or build it yourself.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Android%20%7C%20iOS-blue" alt="Platform" />
  <img src="https://img.shields.io/badge/ROS2-Humble%2B-green" alt="ROS2" />
  <img src="https://img.shields.io/badge/license-GPL--3.0-orange" alt="License" />
</p>

---

<p align="center">
  <img src="screenshots/screen-2.png" height="500" alt="ROSDeck dashboard" />
  
</p>

## Features

- **Rosbridge & Foxglove** — connect via `rosbridge_server` (port 9090) or `foxglove_bridge` (port 8765)
- **Customizable layouts** — tmux-style split panes, save layouts per robot
- **Auto-layout** — detects available topics and suggests a layout
- **Demo mode** — try the app without a robot

### Widgets

| Category | Widget       | Message Type                              |
| -------- | ------------ | ----------------------------------------- |
| Control  | Joystick     | `geometry_msgs/Twist`, `TwistStamped`     |
| Sensor   | Camera       | `sensor_msgs/CompressedImage`, `Image`    |
| Sensor   | Battery      | `sensor_msgs/BatteryState`                |
| Sensor   | IMU          | `sensor_msgs/Imu`, `MagneticField`        |
| Sensor   | Line Chart   | Any numeric topic                         |
| Nav      | Map          | `nav_msgs/OccupancyGrid` + TF + LaserScan |
| Debug    | Topic Viewer | Any topic (raw JSON)                      |
| Debug    | Rosout       | `rcl_interfaces/Log`                      |
| Debug    | Diagnostics  | `diagnostic_msgs/DiagnosticArray`         |
| Debug    | TF Tree      | `/tf`, `/tf_static`                       |

The map widget supports Nav2 goal pose publishing, costmap overlays, and laser scan visualization.

## Getting Started

### Prerequisites

- Node.js and npm
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- A ROS2 robot running `rosbridge_server` or `foxglove_bridge`

### Robot Setup

```bash
# Install rosbridge
sudo apt install ros-${ROS_DISTRO}-rosbridge-suite

# Launch it
ros2 launch rosbridge_server rosbridge_websocket_launch.xml
```

### App Setup

```bash
git clone https://github.com/baunuri/rosdeck.git
cd rosdeck
cp app.json.example app.json
cp eas.json.example eas.json
npm install
npm start
```

Edit `app.json` with your own `slug`, `bundleIdentifier`, `package`, and EAS `projectId` before building.

### Build

```bash
npm run build:android-debug        # Debug APK
npm run build:android-preview      # Release APK
npm run build:android-production   # AAB for Play Store
```

## Architecture

```
app/(tabs)/        # Three-tab UI: Connect, Control, Settings
widgets/           # Widget definitions and components
stores/            # Zustand state management
lib/               # Transport layers (rosbridge, foxglove, demo)
components/        # Shared React Native components
types/             # TypeScript interfaces
```

## License

GPLv3 — see [LICENSE](LICENSE).

You can build and use this app freely. If you distribute a modified version, you must open-source your changes under the same license.
