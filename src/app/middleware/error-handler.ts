import fp from "fastify-plugin";
import type { FastifyError, FastifyInstance } from "fastify";

type Validationish = FastifyError & { validation?: unknown; code?: string };

export default fp(function errorHandler(app: FastifyInstance) {
  app.setErrorHandler((err, _req, reply) => {
    const e = err as Validationish;
    const hasValidation = ("validation" in e && e.validation != null) || e.code === "FST_ERR_VALIDATION";
    if (hasValidation) {
      reply.status(400).send({ error: "Bad Request" });
      return;
    }
    reply.status(500).send({ error: "Bad Request" });
  });
});
