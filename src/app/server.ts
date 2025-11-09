import Fastify from "fastify";
import requestId from "./middleware/request-id.js";
import errorHandler from "./middleware/error-handler.js";
import { registerRoutes } from "./routes.js";
import { loggerOptions } from "../adapters/telemetry/logger.js";
import { HTTP } from "../config/constants.js";
import "../config/env.js";

export function buildServer() {
  const app = Fastify({ logger: loggerOptions });
  app.register(requestId);
  app.register(errorHandler);
  app.get("/health", () => ({ ok: true }));
  app.register(registerRoutes);
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = buildServer();
  app.listen({ port: HTTP.port, host: HTTP.host }).catch(err => {
    app.log.error(err);
    process.exit(1);
  });
}
