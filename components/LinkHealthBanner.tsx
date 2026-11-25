import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRosStore } from '../stores/useRosStore';
import { formatRate, linkReport, type LinkReport } from '../lib/link-health';
import { theme } from '../constants/theme';

/** Shown while subscribed data arrives more than a second late: the link can't carry it all. */
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
    <View style={styles.banner} accessibilityRole="alert">
      <View style={styles.row}>
        <Ionicons name="warning-outline" size={13} color={theme.colors.statusConnecting} />
        <Text style={styles.title}>
          DATA {(report.lagMs / 1000).toFixed(1)} S BEHIND · RECEIVING {formatRate(report.bytesPerSec).toUpperCase()}
        </Text>
      </View>
      <Text style={styles.detail} numberOfLines={2}>
        {heaviest}.{resets > 0 ? ` Backlog dropped ${resets}×.` : ''} Remove a layer or downsample on the robot.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FBBF2420',
    borderBottomWidth: 1,
    borderBottomColor: '#FBBF2433',
    paddingVertical: 5,
    paddingHorizontal: 12,
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
  detail: { fontFamily: 'SpaceMono', fontSize: 10, color: theme.colors.textSecondary, textAlign: 'center' },
});
