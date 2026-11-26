/**
 * Is the link to the robot keeping up? foxglove_bridge stamps every message with its own
 * clock; (local now − that stamp) = clock offset + time spent queued. The clock offset is
 * constant, so the smallest value seen is the no-queue baseline and anything above it is lag.
 * No clock sync needed. ponytail: a phone clock jump (NTP) shifts this until reconnect.
 */

export interface LinkSample {
  minOffsetMs: number;
  /** Times the heavy-topic connection was replaced to drop the robot-side backlog. */
  resets?: number;
  /** subscribedAt: local time we subscribed to the topic (on this connection). */
  topics: Array<{ topic: string; offsetMs: number; bytes: number; seenAt: number; subscribedAt: number }>;
}

export interface LinkReport {
  /** Worst lag over topics still arriving, ms. */
  lagMs: number;
  /** Everything received, bytes/s. */
  bytesPerSec: number;
  /** Topics more than LAG_MS behind, heaviest first. */
  behind: Array<{ topic: string; lagMs: number; bytesPerSec: number }>;
}

export const LAG_MS = 1000;
/** Allowance for clock-offset estimation error when telling latched messages from queued ones. */
const LATCHED_SLACK_MS = 1000;
/** A topic not heard from for this long no longer counts (unsubscribed, or publisher stopped). */
const STALE_MS = 5000;

export function linkReport(sample: LinkSample, now: number, elapsedMs: number): LinkReport {
  const perSec = 1000 / Math.max(elapsedMs, 1);
  const live = sample.topics.filter((t) => now - t.seenAt < STALE_MS);
  const rows = live
    .map((t) => ({ topic: t.topic, lagMs: t.offsetMs - sample.minOffsetMs, bytesPerSec: t.bytes * perSec, subscribedFor: t.seenAt - t.subscribedAt }))
    // A message can't have queued longer than we've been subscribed. One that looks older was
    // published before we asked: a latched message (map, /tf_static), whose bridge stamp is its
    // original publish time. Not lag.
    .filter((r) => r.lagMs <= r.subscribedFor + LATCHED_SLACK_MS);
  return {
    lagMs: rows.reduce((m, r) => Math.max(m, r.lagMs), 0),
    bytesPerSec: rows.reduce((sum, r) => sum + r.bytesPerSec, 0),
    behind: rows.filter((r) => r.lagMs > LAG_MS).sort((a, b) => b.bytesPerSec - a.bytesPerSec),
  };
}

export const formatRate = (bytesPerSec: number) =>
  bytesPerSec >= 1e6 ? `${(bytesPerSec / 1e6).toFixed(1)} MB/s` : `${Math.round(bytesPerSec / 1e3)} KB/s`;
