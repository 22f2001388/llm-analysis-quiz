import pino, { LoggerOptions, LogFn } from "pino";

export const loggerOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: null,
  timestamp: () => {
    const now = new Date();
    const ist = now.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `"time":"${ist}.${ms}"`;
  },
  formatters: {
    level() {
      return {};
    },
    bindings() {
      return {};
    },
    log(object) {
      return object;
    }
  },
  redact: {
    paths: ["req.headers.authorization", "req.body.secret", "res.body.secret"],
    remove: true
  },
  hooks: {
    logMethod(args: unknown[], method: LogFn) {
      if (args.length && typeof args[0] === "object" && args[0] !== null) {
        const obj = args[0] as Record<string, unknown>;
        if (typeof obj.responseTime === "number") {
          obj.responseTime = Math.round(obj.responseTime);
        }
        if ("level" in obj) {
          delete obj.level;
        }
      }
      return method.apply(this, args as Parameters<LogFn>);
    }
  }
};

const transport = process.env.NODE_ENV !== 'production' ? {
  target: 'pino-pretty',
  options: {
    colorize: false,
    translateTime: false,
    ignore: 'pid,hostname',
    singleLine: false
  }
} : undefined;

export const logger = pino({
  ...loggerOptions,
  transport
});
