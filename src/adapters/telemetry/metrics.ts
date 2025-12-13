
interface MetricsStore {
  requests_total: number;
  requests_failed: number;
  requests_success: number;
  // Simple latency tracking (could use histogram in real app)
  cumulative_latency_ms: number;
  request_count_for_latency: number;
}

const store: MetricsStore = {
  requests_total: 0,
  requests_failed: 0,
  requests_success: 0,
  cumulative_latency_ms: 0,
  request_count_for_latency: 0
};

export const metrics = {
  increment: (key: keyof Pick<MetricsStore, 'requests_total' | 'requests_failed' | 'requests_success'>) => {
    store[key]++;
  },

  observeLatency: (ms: number) => {
    store.cumulative_latency_ms += ms;
    store.request_count_for_latency++;
  },

  getSnapshot: () => {
    const avgLatency = store.request_count_for_latency > 0
      ? Math.round(store.cumulative_latency_ms / store.request_count_for_latency)
      : 0;

    return {
      requests: {
        total: store.requests_total,
        failed: store.requests_failed,
        success: store.requests_success
      },
      latency: {
        avg_ms: avgLatency
      },
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };
  }
};
