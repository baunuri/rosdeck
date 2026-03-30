// widgets/imu/AttitudeIndicator.tsx
import React, { useMemo } from 'react';
import {
  Canvas,
  Group,
  Rect,
  Circle,
  Line,
  vec,
  RoundedRect,
  Skia,
  useFont,
  Text as SkiaText,
} from '@shopify/react-native-skia';
import { radToDeg } from './math';

interface AttitudeIndicatorProps {
  size: number;
  roll: number;   // radians
  pitch: number;  // radians
  heading: number | null; // radians [0,2π) or null if no mag
  yaw: number;    // radians (used when heading is null)
}

const SKY_COLOR_BOTTOM = '#60a5fa';
const GROUND_COLOR_TOP = '#92400e';
const HORIZON_LINE = 'rgba(255,255,255,0.3)';
const GOLD = '#FFD700';
const NORTH_RED = '#ff6b6b';
const WHITE = '#ffffff';
const WHITE_DIM = 'rgba(255,255,255,0.3)';

const COMPASS_POINTS = [
  { deg: 0, label: 'N', color: NORTH_RED },
  { deg: 45, label: 'NE', color: WHITE },
  { deg: 90, label: 'E', color: WHITE },
  { deg: 135, label: 'SE', color: WHITE },
  { deg: 180, label: 'S', color: WHITE },
  { deg: 225, label: 'SW', color: WHITE },
  { deg: 270, label: 'W', color: WHITE },
  { deg: 315, label: 'NW', color: WHITE },
];

const PITCH_TICKS = [-20, -10, -5, 5, 10, 20];

export function AttitudeIndicator({
  size,
  roll,
  pitch,
  heading,
  yaw,
}: AttitudeIndicatorProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;
  const font = useFont(require('../../assets/fonts/SpaceMono-Regular.ttf'), Math.max(8, size * 0.045));
  const smallFont = useFont(require('../../assets/fonts/SpaceMono-Regular.ttf'), Math.max(7, size * 0.035));
  const clipPath = useMemo(() => {
    const p = Skia.Path.Make();
    p.addCircle(cx, cy, r);
    return p;
  }, [size]);

  if (!font || !smallFont) return null;

  const pitchScale = r / 30;
  const pitchOffset = pitch * (180 / Math.PI) * pitchScale;

  const layerH = size * 3;
  const layerW = size * 3;
  const layerOx = cx - layerW / 2;
  const layerOy = cy - layerH / 2;

  const showCompass = heading !== null;
  const tickH = size * 0.06;  // height of compass tick marks

  const displayHeading = heading !== null ? heading : 0;
  const headingDeg = radToDeg(displayHeading);

  const compassScale = r / 60;

  return (
    <Canvas style={{ width: size, height: size }}>
      <Group clip={clipPath}>
        <Group
          transform={[
            { translateX: cx },
            { translateY: cy },
            { rotate: -roll },
            { translateY: pitchOffset },
            { translateX: -cx },
            { translateY: -cy },
          ]}
        >
          <Rect x={layerOx} y={layerOy} width={layerW} height={layerH / 2} color={SKY_COLOR_BOTTOM} />
          <Rect x={layerOx} y={layerOy + layerH / 2} width={layerW} height={layerH / 2} color={GROUND_COLOR_TOP} />
          <Line p1={vec(layerOx, cy)} p2={vec(layerOx + layerW, cy)} color={HORIZON_LINE} strokeWidth={1} />

          {PITCH_TICKS.map((deg) => {
            const py = cy - deg * pitchScale;
            const tickW = Math.abs(deg) % 10 === 0 ? r * 0.3 : r * 0.15;
            return (
              <React.Fragment key={deg}>
                <Line
                  p1={vec(cx - tickW / 2, py)}
                  p2={vec(cx + tickW / 2, py)}
                  color={WHITE_DIM}
                  strokeWidth={1}
                />
                {Math.abs(deg) % 10 === 0 && (
                  <SkiaText
                    x={cx + tickW / 2 + 4}
                    y={py + 3}
                    text={`${deg}`}
                    font={smallFont}
                    color={WHITE_DIM}
                  />
                )}
              </React.Fragment>
            );
          })}

          {/* Compass ticks and labels on the horizon line */}
          {showCompass && (
            <>
              {/* Cardinal/intercardinal labels above horizon */}
              {COMPASS_POINTS.map((pt) => {
                let delta = pt.deg - headingDeg;
                if (delta > 180) delta -= 360;
                if (delta < -180) delta += 360;
                const px = cx + delta * compassScale;
                const textW = font.measureText(pt.label).width;
                const isCardinal = pt.deg % 90 === 0;
                const markH = isCardinal ? tickH : tickH * 0.6;
                return (
                  <React.Fragment key={pt.deg}>
                    {/* Tick mark crossing the horizon */}
                    <Line
                      p1={vec(px, cy - markH)}
                      p2={vec(px, cy + markH)}
                      color={pt.color}
                      strokeWidth={isCardinal ? 2 : 1}
                    />
                    {/* Label above the tick */}
                    <SkiaText
                      x={px - textW / 2}
                      y={cy - markH - 3}
                      text={pt.label}
                      font={font}
                      color={pt.color}
                    />
                  </React.Fragment>
                );
              })}

              {/* Minor ticks every 15° */}
              {Array.from({ length: 24 }, (_, i) => i * 15).map((deg) => {
                if (deg % 45 === 0) return null;
                let delta = deg - headingDeg;
                if (delta > 180) delta -= 360;
                if (delta < -180) delta += 360;
                const px = cx + delta * compassScale;
                const minorH = tickH * 0.35;
                return (
                  <Line
                    key={`tick-${deg}`}
                    p1={vec(px, cy - minorH)}
                    p2={vec(px, cy + minorH)}
                    color={WHITE_DIM}
                    strokeWidth={1}
                  />
                );
              })}
            </>
          )}
        </Group>
      </Group>

      <Circle cx={cx} cy={cy} r={r} color="#555" style="stroke" strokeWidth={2} />

      <Line p1={vec(cx - 4, cy - 2)} p2={vec(cx, cy - 8)} color={GOLD} strokeWidth={2} />
      <Line p1={vec(cx, cy - 8)} p2={vec(cx + 4, cy - 2)} color={GOLD} strokeWidth={2} />
      <Line p1={vec(cx - 4, cy + 2)} p2={vec(cx, cy + 8)} color={GOLD} strokeWidth={2} />
      <Line p1={vec(cx, cy + 8)} p2={vec(cx + 4, cy + 2)} color={GOLD} strokeWidth={2} />

      <Line p1={vec(cx - 5, 6)} p2={vec(cx, 14)} color={GOLD} strokeWidth={2} />
      <Line p1={vec(cx, 14)} p2={vec(cx + 5, 6)} color={GOLD} strokeWidth={2} />

      {/* Heading readout box — sized to text */}
      {(() => {
        const hdgText = heading !== null ? `HDG ${Math.round(headingDeg)}°` : `YAW ${Math.round(radToDeg(yaw))}°`;
        const metrics = smallFont.measureText(hdgText);
        const textW = metrics.width;
        const fontMetrics = smallFont.getMetrics();
        const textH = fontMetrics.descent - fontMetrics.ascent;
        const padH = 8;
        const padV = 4;
        const boxW = textW + padH * 2;
        const boxH = textH + padV * 2;
        const boxY = size - boxH - 8;
        const textY = boxY + padV - fontMetrics.ascent;
        return (
          <>
            <RoundedRect x={cx - boxW / 2} y={boxY} width={boxW} height={boxH} r={3} color="rgba(0,0,0,0.7)" />
            <RoundedRect x={cx - boxW / 2} y={boxY} width={boxW} height={boxH} r={3} color="#555" style="stroke" strokeWidth={1} />
            <SkiaText
              x={cx - textW / 2}
              y={textY}
              text={hdgText}
              font={smallFont}
              color={WHITE}
            />
          </>
        );
      })()}
    </Canvas>
  );
}
