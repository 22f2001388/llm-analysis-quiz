import fp from "fastify-plugin";
import { randomUUID } from "node:crypto";

export default fp(async function requestId(app) {
  app.addHook("onRequest", async (req, reply) => {
    const rid = req.headers["x-request-id"]?.toString() || randomUUID();
    reply.header("x-request-id", rid);
    req.id = rid;
    req.log = req.log.child({ requestId: rid });
  });
});
