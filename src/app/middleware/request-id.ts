import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";

export function registerRequestId(app: FastifyInstance) {
  app.addHook("onRequest", (req, reply, done) => {
    const rid = req.headers["x-request-id"]?.toString() ?? randomUUID();
    reply.header("x-request-id", rid);
    req.id = rid;
    done();
  });

  app.addHook("preHandler", (req, reply, done) => {
    req.log = req.log.child({ requestId: req.id });
    done();
  });
}
