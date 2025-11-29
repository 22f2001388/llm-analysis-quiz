import type { FastifyInstance } from "fastify";
import { ErrorCode, isDomainError } from "@/types/errors.js";



export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err, req, reply) => {
    const hasValidation =
      (err && typeof err === 'object' && "validation" in err && err.validation != null) || 
      (err && typeof err === 'object' && 'code' in err && err.code === "FST_ERR_VALIDATION");
    if (hasValidation) {
      const body = { error: "Bad Request", code: ErrorCode.INPUT_400 };
      req.log.warn({ event: "input_validation_failed", code: body.code }, body.error);
      reply.status(400).send(body);
      return;
    }

    if (isDomainError(err)) {
      const body = { error: err.message || err.code, code: err.code };
      req.log.warn({ event: "domain_error", code: err.code, details: err.details }, body.error);
      reply.status(err.status).send(body);
      return;
    }

    const body = { error: "Internal Server Error", code: ErrorCode.UNEXPECTED_500 };
    req.log.error({ event: "unhandled_error", err: err }, body.error);
    reply.status(500).send(body);
  });
}
