import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Canvas, Path, Skia, Line, vec } from '@shopify/react-native-skia';
import { useRosStore } from '../../stores/useRosStore';
import { theme } from '../../constants/theme';
import type { WidgetProps } from '../../types/layout';
import type { SeriesConfig } from '../../components/SeriesEditor';
import { getFieldValue } from '../../components/FieldPicker';

interface Sample { t: number; v: number }

const TITLE_H = 28;
const PL = 42;  // left  — room for y-axis labels
const PB = 22;  // bottom — room for x-axis labels
const PT = 4;
const PR = 8;
const RENDER_MS = 250;           // 4 fps render tick — chart doesn't need more
const LEGEND_ROW_H = 20;
const LEGEND_ITEM_W = 80;        // approximate px per legend item
const LEGEND_PAD = 8;            // horizontal padding of the legend strip

function formatYTick(v: number): string {
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

function formatXTick(offsetSec: number): string {
  if (offsetSec === 0) return 'now';
  return `-${Math.round(Math.abs(offsetSec))}s`;
}

function seriesLabel(s: SeriesConfig): string {
  if (s.label) return s.label;
  const parts = s.field.split('.');
  return parts.slice(-2).join('.');
}

export function ChartWidget(props: Partial<WidgetProps>) {
  const transport = useRosStore((s) => s.transport);
  const status = useRosStore((s) => s.connection.status);

  const series: SeriesConfig[] = props?.config?.series ?? [];
  const windowSec: number = props?.config?.windowSec ?? 30;
  const yMinConfig: number | undefined = props?.config?.yMin;
  const yMaxConfig: number | undefined = props?.config?.yMax;

  const width = props?.width ?? 300;
  const height = props?.height ?? 200;

  // ── Legend geometry ─────────────────────────────────────────────────────────
  // Items are distributed into even columns that fill the full strip width.
  const legendAvailW = width - LEGEND_PAD * 2;
  const legendCols = Math.max(1, Math.min(series.length, Math.floor(legendAvailW / LEGEND_ITEM_W)));
  const legendItemW = legendAvailW / legendCols;
  const legendRows = series.length === 0 ? 0 : Math.ceil(series.length / legendCols);
  const legendH = legendRows > 0 ? legendRows * LEGEND_ROW_H + 6 : 0;

  // ── Canvas / chart geometry ──────────────────────────────────────────────────
  // Canvas lives below the title row. Its coordinate system starts at (0,0).
  const canvasH = height - TITLE_H - legendH;
  const chartW = width - PL - PR;
  const chartH = canvasH - PT - PB;

  // ── Data buffers ─────────────────────────────────────────────────────────────
  // Samples are pushed into bufferRef by subscription callbacks (no React state).
  // A render tick bumps a counter to trigger re-render; we read bufferRef directly.
  const bufferRef = useRef<Sample[][]>([]);
  const [tick, setTick] = useState(0);

  const seriesKey = series.map((s) => `${s.topic}|${s.field}|${s.messageType}`).join(',');

  useEffect(() => {
    bufferRef.current = series.map((_, i) => bufferRef.current[i] ?? []);
  }, [series.length]);

  useEffect(() => {
    if (!transport || status !== 'connected' || series.length === 0) return;
    const subs = series.map((s, i) => {
      if (!s.topic || !s.field || !s.messageType) return null;
      return transport.subscribe(s.topic, s.messageType, (msg: any) => {
        const v = getFieldValue(msg, s.field);
        if (typeof v === 'number' && isFinite(v)) {
          if (!bufferRef.current[i]) bufferRef.current[i] = [];
          bufferRef.current[i].push({ t: Date.now(), v });
        }
      });
    });
    return () => subs.forEach((sub) => sub?.unsubscribe());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport, status, seriesKey]);

  // Prune old samples and trigger re-render at a low frequency
  useEffect(() => {
    const timer = setInterval(() => {
      const cutoff = Date.now() - windowSec * 1000;
      for (let i = 0; i < bufferRef.current.length; i++) {
        const buf = bufferRef.current[i];
        // Binary search for cutoff to avoid filtering entire array
        let lo = 0;
        let hi = buf.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (buf[mid].t < cutoff) lo = mid + 1; else hi = mid;
        }
        if (lo > 0) bufferRef.current[i] = buf.slice(lo);
      }
      setTick((t) => t + 1);
    }, RENDER_MS);
    return () => clearInterval(timer);
  }, [windowSec]);

  // ── Build render data from bufferRef (read on each tick) ───────────────────
  const now = Date.now();
  const xMin = now - windowSec * 1000;
  const scaleX = (t: number) => PL + ((t - xMin) / (now - xMin)) * chartW;
  const scaleY = useCallback((v: number, yLo: number, yHi: number) =>
    PT + (1 - (v - yLo) / (yHi - yLo)) * chartH, [chartH]);

  // ── Y axis — compute min/max without spreading all values ──────────────────
  let dataMin = Infinity;
  let dataMax = -Infinity;
  let hasData = false;
  for (const buf of bufferRef.current) {
    for (let j = 0; j < buf.length; j++) {
      const v = buf[j].v;
      if (v < dataMin) dataMin = v;
      if (v > dataMax) dataMax = v;
      hasData = true;
    }
  }
  let yMin = yMinConfig ?? (hasData ? dataMin : 0);
  let yMax = yMaxConfig ?? (hasData ? dataMax : 1);
  if (yMax === yMin) { yMin -= 0.5; yMax += 0.5; }
  if (yMinConfig === undefined || yMaxConfig === undefined) {
    const pad = (yMax - yMin) * 0.05;
    if (yMinConfig === undefined) yMin -= pad;
    if (yMaxConfig === undefined) yMax += pad;
  }

  const yTicks = [0, 1, 2, 3].map((i) => yMin + (i / 3) * (yMax - yMin));
  const xTickOffsets = [0, -windowSec / 2, -windowSec];

  // ── Skia paths — built directly from bufferRef, no snapshot copy ───────────
  const paths = bufferRef.current.map((samples) => {
    if (samples.length < 2) return null;
    const p = Skia.Path.Make();
    p.moveTo(scaleX(samples[0].t), scaleY(samples[0].v, yMin, yMax));
    for (let j = 1; j < samples.length; j++) {
      p.lineTo(scaleX(samples[j].t), scaleY(samples[j].v, yMin, yMax));
    }
    return p;
  });
  // Force dependency on tick so linter doesn't complain about unused var
  void tick;

  return (
    <View style={[styles.container, { width, height }]}>

      {/* Title row */}
      <View style={styles.titleRow}>
        <Text style={styles.titleLabel}>CHART</Text>
      </View>

      {/* Canvas area */}
      <View style={{ width, height: canvasH }}>
        <Canvas style={StyleSheet.absoluteFill}>
          {/* Horizontal grid lines */}
          {yTicks.map((tick, i) => {
            const y = scaleY(tick, yMin, yMax);
            return (
              <Line key={`hy-${i}`} p1={vec(PL, y)} p2={vec(PL + chartW, y)}
                color="#1A1A1A" strokeWidth={1} />
            );
          })}

          {/* Vertical grid lines */}
          {xTickOffsets.map((offset, i) => {
            const x = scaleX(now + offset * 1000);
            return (
              <Line key={`vx-${i}`} p1={vec(x, PT)} p2={vec(x, PT + chartH)}
                color="#1A1A1A" strokeWidth={1} />
            );
          })}

          {/* Axis borders */}
          <Line p1={vec(PL, PT)} p2={vec(PL, PT + chartH)} color="#222222" strokeWidth={1} />
          <Line p1={vec(PL, PT + chartH)} p2={vec(PL + chartW, PT + chartH)} color="#222222" strokeWidth={1} />

          {/* Series lines */}
          {paths.map((path, i) =>
            path ? (
              <Path key={i} path={path}
                color={series[i]?.color ?? theme.colors.accentPrimary}
                style="stroke" strokeWidth={1.5} />
            ) : null
          )}
        </Canvas>

        {/* Y axis labels */}
        {yTicks.map((tick, i) => (
          <Text key={`yl-${i}`} style={[styles.axisLabel, {
            position: 'absolute',
            top: scaleY(tick, yMin, yMax) - 6,
            left: 0,
            width: PL - 4,
            textAlign: 'right',
          }]} numberOfLines={1}>
            {formatYTick(tick)}
          </Text>
        ))}

        {/* X axis labels */}
        {xTickOffsets.map((offset, i) => {
          const x = scaleX(now + offset * 1000);
          return (
            <Text key={`xl-${i}`} style={[styles.axisLabel, {
              position: 'absolute',
              bottom: 2,
              left: x - 18,
              width: 36,
              textAlign: 'center',
            }]}>
              {formatXTick(offset)}
            </Text>
          );
        })}

        {/* Empty / unconfigured states */}
        {series.length === 0 && (
          <View style={[StyleSheet.absoluteFill, styles.emptyOverlay]}>
            <Text style={styles.emptyText}>Add a series in widget settings</Text>
          </View>
        )}
        {series.length > 0 && !hasData && (
          <View style={[StyleSheet.absoluteFill, styles.emptyOverlay]}>
            <Text style={styles.emptyText}>Waiting for data...</Text>
          </View>
        )}
      </View>

      {/* Legend strip — even columns, wraps to multiple rows as needed */}
      {legendH > 0 && (
        <View style={[styles.legendStrip, { height: legendH }]}>
          {series.map((s, i) => (
            <View key={i} style={[styles.legendItem, { width: legendItemW }]}>
              <View style={[styles.legendSwatch, { backgroundColor: s.color }]} />
              <Text style={styles.legendText} numberOfLines={1}>
                {seriesLabel(s)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: theme.colors.bgBase, overflow: 'hidden' },
  titleRow: {
    height: TITLE_H,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  titleLabel: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    color: theme.colors.textMuted,
    letterSpacing: 1.5,
  },
  axisLabel: {
    fontFamily: 'SpaceMono',
    fontSize: 9,
    color: theme.colors.textMuted,
  },
  emptyOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: PL,
  },
  emptyText: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  // Legend strip at the bottom — wraps naturally
  legendStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'center',
    paddingHorizontal: LEGEND_PAD,
    paddingVertical: 3,
    borderTopWidth: 1,
    borderTopColor: '#222222',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
    paddingRight: 4,
  },
  legendSwatch: {
    width: 12,
    height: 2,
    borderRadius: 1,
  },
  legendText: {
    fontFamily: 'SpaceMono',
    fontSize: 9,
    color: theme.colors.textSecondary,
    flex: 1,
  },
});
