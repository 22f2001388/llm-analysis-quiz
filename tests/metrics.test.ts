
import { describe, it, expect } from 'vitest';
import { metrics } from '@/adapters/telemetry/metrics.js';

describe('Metrics Adapter', () => {
  it('tracks requests and latency', async () => {
    // Initial state check
    const initial = metrics.getSnapshot();

    // Simulate activity
    metrics.increment('requests_total');
    metrics.increment('requests_success');
    metrics.observeLatency(100);
    metrics.observeLatency(200);

    const updated = metrics.getSnapshot();

    expect(updated.requests.total).toBe(initial.requests.total + 1);
    expect(updated.requests.success).toBe(initial.requests.success + 1);
    expect(updated.latency.avg_ms).toBe(Math.round((100 + 200) / 2));
  });

  it('exposes system metrics', () => {
    const snapshot = metrics.getSnapshot();
    expect(snapshot.uptime).toBeGreaterThan(0);
    expect(snapshot.memory).toBeDefined();
  });
});
