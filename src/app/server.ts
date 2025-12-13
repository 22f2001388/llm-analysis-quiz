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
  app.listen({ port: HTTP.port, host: HTTP.host }).then(() => {
    // OPTIMIZATION: Pre-warm browser and LLM in background after server starts
    // This reduces latency on the first incoming request
    void (async () => {
      try {
        const { getPage, releasePage } = await import("@/core/browser/client.js");
        const { prewarmLlm } = await import("@/adapters/llm/gemini.js");

        // Pre-warm LLM (non-blocking small request)
        prewarmLlm().catch(() => { });

        // Pre-warm browser (acquire and release a page to trigger launch)
        const page = await getPage();
        await releasePage(page);
        app.log.info({ event: 'warmup:complete' }, 'Browser and LLM pre-warmed successfully');
      } catch (err) {
        app.log.warn({ event: 'warmup:failed', error: err instanceof Error ? err.message : String(err) }, 'Pre-warming failed (non-critical)');
      }
    })();
  }).catch((err: Error) => {
    app.log.error(err);
    process.exit(1);
  });

  const shutdown = async (signal: string) => {
    app.log.info({ event: 'server:shutdown:start', signal }, 'Signal received, starting shutdown');

    // Force exit if cleanup takes too long
    const forceExit = setTimeout(() => {
      app.log.error({ event: 'server:shutdown:timeout' }, 'Shutdown timed out, forcing exit');
      process.exit(1);
    }, 5000);

    try {
      // 1. Stop accepting new requests
      await app.close();

      // 2. Shut down browser resources (frees RSS)
      const { shutdown: shutdownBrowser } = await import("@/core/browser/client.js");
      await shutdownBrowser();

      app.log.info({ event: 'server:shutdown:complete' }, 'Graceful shutdown successful');
      clearTimeout(forceExit);
      process.exit(0);
    } catch (err) {
      app.log.error({ event: 'server:shutdown:error', err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}