import fp from "fastify-plugin";

export default fp(async function errorHandler(app) {
  app.setErrorHandler((err, req, reply) => {
    if ((err as any).validation || err.code === "FST_ERR_VALIDATION") {
      reply.status(400).send({ error: "Bad Request" });
      return;
    }
    reply.status(500).send({ error: "Bad Request" });
  });
});
