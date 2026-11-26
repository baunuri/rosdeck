import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRosStore } from '../stores/useRosStore';
import { formatRate, linkReport, type LinkReport } from '../lib/link-health';
import { theme } from '../constants/theme';

/**
 * Floats over the layout while subscribed data arrives more than a second late: the link can't
 * carry it all. Overlay + pointerEvents none, so it never shifts panes or swallows a touch.
 */
export function LinkHealthBanner() {
  const transport = useRosStore((s) => s.transport);
  const [report, setReport] = useState<LinkReport | null>(null);
  const [resets, setResets] = useState(0);

  useEffect(() => {
    if (!transport?.takeLinkSample) return;
    transport.takeLinkSample(); // start the byte counters from now
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const sample = transport.takeLinkSample!();
      setReport(linkReport(sample, now, now - last));
      setResets(sample.resets ?? 0);
      last = now;
    }, 1000);
    return () => { clearInterval(timer); setReport(null); };
  }, [transport]);

  if (!report || report.behind.length === 0) return null;
  const heaviest = report.behind.slice(0, 2).map((t) => `${t.topic} ${formatRate(t.bytesPerSec)}`).join(' · ');
  return (
    <View style={styles.anchor} pointerEvents="none">
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(400)} style={styles.pill} accessibilityRole="alert">
        <View style={styles.row}>
          <Ionicons name="warning-outline" size={12} color={theme.colors.statusConnecting} />
          <Text style={styles.title}>
            {(report.lagMs / 1000).toFixed(1)} S BEHIND · {formatRate(report.bytesPerSec).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.detail} numberOfLines={2}>
          {heaviest}{resets > 0 ? ` · backlog dropped ${resets}×` : ''} · drop a layer or downsample
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center', zIndex: 50, elevation: 50 },
  pill: {
    maxWidth: '90%',
    backgroundColor: '#14110BF5',
    borderWidth: 1,
    borderColor: '#FBBF2455',
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 10,
    gap: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  title: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.statusConnecting,
    letterSpacing: 0.8,
  },
  detail: { fontFamily: 'SpaceMono', fontSize: 9, color: theme.colors.textSecondary, textAlign: 'center' },
});
