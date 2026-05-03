import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig, Cluster } from "../../config/index.js";
import { SolanaRpcAdapter, SolanaRpcError } from "../../infra/solana-rpc.js";

export type HealthDeps = {
  checkX402Facilitator?: () => Promise<void>;
};

export function registerHealthRoutes(
  app: FastifyInstance,
  config: AppConfig,
  createRpc: (cluster: Cluster) => SolanaRpcAdapter,
  healthDeps?: HealthDeps,
) {
  app.get("/health", async (_req, reply: FastifyReply) => {
    return reply.send({ status: "ok" });
  });

  app.get("/health/ready", async (req, reply: FastifyReply) => {
    const clusters: Cluster[] = ["mainnet-beta", "devnet", "testnet"];
    const checks: Record<string, { ok: boolean; error?: string }> = {};

    for (const c of clusters) {
      const url = config.rpcByCluster[c];
      if (!url) {
        checks[c] = { ok: false, error: "not_configured" };
        continue;
      }
      try {
        const adapter = createRpc(c);
        await adapter.pingRpc();
        checks[c] = { ok: true };
      } catch (e) {
        const msg = e instanceof SolanaRpcError ? e.message : String(e);
        req.log.warn({ cluster: c, err: e }, "readiness check failed");
        checks[c] = { ok: false, error: msg };
      }
    }

    if (config.x402.enabled && healthDeps?.checkX402Facilitator) {
      try {
        await healthDeps.checkX402Facilitator();
        checks.x402_facilitator = { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        req.log.warn({ err: e }, "x402 facilitator readiness check failed");
        checks.x402_facilitator = { ok: false, error: msg };
      }
    }

    const allConfigured = clusters.every((c) => config.rpcByCluster[c]);
    const rpcOk = clusters.every((c) => checks[c]?.ok);
    const facilitatorOk =
      !config.x402.enabled || checks.x402_facilitator?.ok !== false;
    const allOk = rpcOk && facilitatorOk;

    if (!allConfigured) {
      return reply.status(503).send({
        status: "degraded",
        checks,
        message: "One or more cluster RPC URLs are not configured",
      });
    }

    if (!allOk) {
      return reply.status(503).send({ status: "degraded", checks });
    }

    return reply.send({ status: "ready", checks });
  });
}
