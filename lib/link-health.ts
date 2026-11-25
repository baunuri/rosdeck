/**
 * Is the link to the robot keeping up? foxglove_bridge stamps every message with its own
 * clock; (local now − that stamp) = clock offset + time spent queued. The clock offset is
 * constant, so the smallest value seen is the no-queue baseline and anything above it is lag.
 * No clock sync needed. ponytail: a phone clock jump (NTP) shifts this until reconnect.
 */

export interface LinkSample {
  minOffsetMs: number;
  topics: Array<{ topic: string; offsetMs: number; bytes: number; seenAt: number }>;
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
/** A topic not heard from for this long no longer counts (unsubscribed, or publisher stopped). */
const STALE_MS = 5000;

export function linkReport(sample: LinkSample, now: number, elapsedMs: number): LinkReport {
  const perSec = 1000 / Math.max(elapsedMs, 1);
  const live = sample.topics.filter((t) => now - t.seenAt < STALE_MS);
  const rows = live.map((t) => ({ topic: t.topic, lagMs: t.offsetMs - sample.minOffsetMs, bytesPerSec: t.bytes * perSec }));
  return {
    lagMs: rows.reduce((m, r) => Math.max(m, r.lagMs), 0),
    bytesPerSec: rows.reduce((sum, r) => sum + r.bytesPerSec, 0),
    behind: rows.filter((r) => r.lagMs > LAG_MS).sort((a, b) => b.bytesPerSec - a.bytesPerSec),
  };
}

export const formatRate = (bytesPerSec: number) =>
  bytesPerSec >= 1e6 ? `${(bytesPerSec / 1e6).toFixed(1)} MB/s` : `${Math.round(bytesPerSec / 1e3)} KB/s`;
