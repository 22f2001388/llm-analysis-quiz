import { FastifyInstance } from "fastify";
import * as S from "sury";
import { safeEqualsSecret, safeEqualsEmail } from "@/config/env.js";
import { runChain } from "@/core/orchestrator/chain-controller.js";
import { logger } from "@/adapters/telemetry/logger.js";
import { metrics } from "@/adapters/telemetry/metrics.js";

const Body = S.schema({
  email: S.string.with(S.email),
  secret: S.string,
  url: S.string.with(S.url)
});

export function registerRoutes(app: FastifyInstance) {
  app.get("/health", async (_, reply) => {
    const snapshot = metrics.getSnapshot();
    reply.send({
      service: "LLM Analysis Quiz",
      status: "running",
      endpoints: {
        health: "/health",
        solve: "/solve"
      },
      ...snapshot
    });
  });

  app.post("/solve", async (req, reply) => {
    const t0 = Date.now();
    metrics.increment('requests_total');

    const requestId = req.id;
    reply.header("x-request-id", requestId);

    logger.info({ event: 'solve:request', body: req.body }, 'Received solve request payload');

    let email: string, secret: string, url: string;
    const parsed = Body["~standard"].validate(req.body);
    if (parsed instanceof Promise) {
      const result = await parsed;
      if (result.issues) {
        metrics.increment('requests_failed');
        reply.status(400).send({ error: "Bad Request", requestId });
        return;
      }
      ({ email, secret, url } = result.value);
    } else {
      if (parsed.issues) {
        metrics.increment('requests_failed');
        reply.status(400).send({ error: "Bad Request", requestId });
        return;
      }
      ({ email, secret, url } = parsed.value);
    }

    if (!safeEqualsEmail(String(email))) {
      metrics.increment('requests_failed');
      reply.status(403).send({
        error: "Invalid email address",
        message: "The provided email address is not authorized",
        requestId
      });
      return;
    }

    // Then validate secret
    if (!safeEqualsSecret(String(secret))) {
      metrics.increment('requests_failed');
      reply.status(403).send({
        error: "Invalid secret key",
        message: "The provided secret key is incorrect",
        requestId
      });
      return;
    }

    reply.status(200).send({ status: "accepted", requestId });

    // Use a proper async handler to avoid unhandled promise rejections
    const handleChainAsync = async () => {
      try {
        const report = await runChain(String(email), String(secret), String(url), requestId);
        metrics.increment('requests_success');
        const elapsed = Date.now() - t0;
        metrics.observeLatency(elapsed);
        logger.info({ event: 'solve:completed', report, elapsedMs: elapsed }, 'Solve chain completed');
      } catch (err) {
        metrics.increment('requests_failed');
        const errorMessage = err instanceof Error ? err.message : String(err);
        const errorStack = err instanceof Error ? err.stack : undefined;
        logger.error({ event: 'solve:failed', errorMessage, errorStack }, 'Solve chain failed');
      }
    };

    // Run asynchronously but handle errors properly
    void handleChainAsync();
  });
}