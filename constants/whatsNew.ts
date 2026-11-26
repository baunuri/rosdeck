/**
 * Shown in Settings → About for the installed version (works offline, at the robot).
 * Update when bumping the version; reuse as the GitHub release / Play release notes.
 */
export const WHATS_NEW: { version: string; notes: string[] } = {
  version: '1.0.5',
  notes: [
    'RViz-style 3D View: maps, costmaps, scans, point clouds, paths, markers and TF',
    'Nav goal and pose estimate tools: hold to place, drag to aim',
    'GPS Map widget: robot position on satellite or street maps',
    'H.264/H.265 camera streams (foxglove CompressedVideo)',
    'Lag warning when the link can’t keep up; safety-critical topics get their own connection',
    'Rotate a split between side-by-side and stacked',
    'Joystick option to stop sending when centered',
    'Tip jar and sponsor contact in Settings',
  ],
};

export const RELEASES_URL = 'https://github.com/baunuri/rosdeck/releases';
