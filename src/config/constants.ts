export const HTTP = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || "127.0.0.1"
};

export const BROWSER = {
  navTimeoutMs: 10000,
  selectorTimeoutMs: 8000,
  waitUntil: "networkidle2" as const
};
