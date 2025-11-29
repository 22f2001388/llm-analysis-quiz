import Fastify from "fastify";
import helmet from "@fastify/helmet";
import { registerRequestId } from "@/app/middleware/request-id.js";
import { registerErrorHandler } from "@/app/middleware/error-handler.js";
import { registerRoutes } from "@/app/routes.js";
import { loggerOptions } from "@/adapters/telemetry/logger.js";
import { HTTP } from "@/config/constants.js";
import "@/config/env.js";

export function buildServer() {
  const app = Fastify({ 
    logger: {
      level: loggerOptions.level || "info",
      base: loggerOptions.base,
      timestamp: loggerOptions.timestamp,
      formatters: loggerOptions.formatters,
      redact: loggerOptions.redact,
      hooks: loggerOptions.hooks
    }
  }) as any;
  void app.register(helmet);
  registerRequestId(app);
  registerErrorHandler(app);
  app.get("/", () => ({ ok: true }));
  registerRoutes(app);
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = buildServer();
  app.listen({ port: HTTP.port, host: HTTP.host }).catch((err: Error) => {
    app.log.error(err);
    process.exit(1);
  });

  process.on('SIGTERM', () => {
    app.log.info('SIGTERM received, closing server');
    void app.close();
  });
  process.on('SIGINT', () => {
    app.log.info('SIGINT received, closing server');
    void app.close();
  });
}