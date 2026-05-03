import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getAuditStore } from "../../data/audit-store.js";

export function registerAuditRoutes(app: FastifyInstance) {
  app.get("/v1/audit/recent", async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as { limit?: string };
    const limit = Math.min(parseInt(query.limit ?? "50", 10) || 50, 200);
    const store = getAuditStore();
    return reply.send({ entries: store.getRecent(limit) });
  });

  app.get("/v1/audit/aggregate", async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as { since?: string };
    const store = getAuditStore();
    return reply.send(store.getAggregate(query.since));
  });

  app.get("/v1/audit/program/:programId", async (req: FastifyRequest, reply: FastifyReply) => {
    const params = req.params as { programId: string };
    const query = req.query as { limit?: string };
    const limit = Math.min(parseInt(query.limit ?? "50", 10) || 50, 200);
    const store = getAuditStore();

    const stats = store.getProgramStats(params.programId);
    const entries = store.getByProgram(params.programId, limit);

    return reply.send({
      programId: params.programId,
      stats: stats
        ? {
            ...stats,
            riskCodes: Object.fromEntries(stats.riskCodes),
          }
        : null,
      recentEntries: entries,
    });
  });
}
