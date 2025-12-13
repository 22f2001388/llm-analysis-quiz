export const HTTP = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || "127.0.0.1"
};

export const BROWSER = {
  navTimeoutMs: 10000,
  selectorTimeoutMs: 30000,
  waitUntil: "networkidle2" as const
};

export const DATA = {
  downloadTimeoutMs: 8000,
  sizeLimitBytes: 1_000_000
};

export const GOVERNOR = {
  totalMs: 180_000,
  minStartMs: 5_000
};

export const LLM = {
  defaultTimeoutMs: 20000,
  minTimeoutMs: 3000,
  reserveMs: 2000
};

export function getRemainingBudget(t0: number): number {
  return Math.max(0, GOVERNOR.totalMs - (Date.now() - t0));
}

export function adaptiveTimeout(t0: number, defaultMs: number, minMs = 1000): number {
  const remaining = getRemainingBudget(t0);
  return Math.max(minMs, Math.min(defaultMs, remaining - LLM.reserveMs));
}

