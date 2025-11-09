import { FastifyInstance } from "fastify";
import { z } from "zod";
import { safeEqualsSecret } from "../config/env.js";

const Body = z.object({
  email: z.string().email(),
  secret: z.string().min(1),
  url: z.string().regex(/^https?:\/\/.+/)
}).strict();

export function registerRoutes(app: FastifyInstance) {
  app.post("/solve", {
    schema: {
      body: {
        type: "object",
        properties: {
          email: { type: "string" },
          secret: { type: "string" },
          url: { type: "string" }
        },
        required: ["email", "secret", "url"],
        additionalProperties: false
      },
      response: {
        200: {
          type: "object",
          properties: { status: { type: "string", enum: ["accepted"] } },
          required: ["status"]
        },
        400: {
          type: "object",
          properties: { error: { type: "string", enum: ["Bad Request"] } },
          required: ["error"]
        },
        403: {
          type: "object",
          properties: { error: { type: "string", enum: ["Forbidden"] } },
          required: ["error"]
        }
      }
    }
  }, async (req, reply) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      reply.status(400).send({ error: "Bad Request" });
      return;
    }
    const { secret } = parsed.data;
    const ok = safeEqualsSecret(secret);
    if (!ok) {
      reply.status(403).send({ error: "Forbidden" });
      return;
    }
    reply.status(200).send({ status: "accepted" });
  });
}
