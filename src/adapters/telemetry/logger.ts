import pino, { LoggerOptions, LogFn } from "pino";

export const loggerOptions: LoggerOptions = {
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  base: null,
  timestamp: () => {
    const ist = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour12: false
    });
    return `"time":"${ist}"`; // no leading comma
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

export const logger = pino(loggerOptions);
