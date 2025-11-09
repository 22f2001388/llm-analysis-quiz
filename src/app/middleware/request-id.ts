import fp from "fastify-plugin";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";

export default fp(function requestId(app: FastifyInstance) {
  app.addHook("onRequest", (req, reply, done) => {
    const rid = req.headers["x-request-id"]?.toString() ?? randomUUID();
    reply.header("x-request-id", rid);
    req.id = rid;
    req.log = req.log.child({ requestId: rid });
    done();
  });
});
