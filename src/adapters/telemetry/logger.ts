import pino from "pino";

export const loggerOptions = {
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  base: null, // removes pid and hostname
  timestamp: () => {
    const ist = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour12: false
    });
    return `,"time":"${ist}"`;
  },
  redact: {
    paths: ["req.headers.authorization", "req.body.secret", "res.body.secret"],
    remove: true
  }
};

export const logger = pino(loggerOptions);
