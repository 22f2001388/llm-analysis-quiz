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
