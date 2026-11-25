import { linkReport } from '../../lib/link-health';

describe('linkReport', () => {
  const now = 100_000;
  // Clock offset of +5 s between phone and robot: /tf is current, the cloud 2.5 s queued.
  const sample = {
    minOffsetMs: 5000,
    topics: [
      { topic: '/tf', offsetMs: 5020, bytes: 20_000, seenAt: now },
      { topic: '/cloud', offsetMs: 7500, bytes: 9_000_000, seenAt: now },
      { topic: '/gone', offsetMs: 9000, bytes: 0, seenAt: now - 10_000 },
    ],
  };

  it('measures lag above the clock-offset baseline, ignoring topics no longer arriving', () => {
    const r = linkReport(sample, now, 1000);
    expect(r.lagMs).toBe(2500);
    expect(r.behind.map((t) => t.topic)).toEqual(['/cloud']);
    expect(r.bytesPerSec).toBe(9_020_000);
  });

  it('reports nothing behind when every topic is current', () => {
    expect(linkReport({ minOffsetMs: 0, topics: [{ topic: '/tf', offsetMs: 30, bytes: 1, seenAt: now }] }, now, 1000).behind).toEqual([]);
  });
});
