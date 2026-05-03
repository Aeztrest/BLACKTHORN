import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AnalyzeDeps } from "../../application/analyze-transaction.js";
import { clusterSchema } from "../../config/index.js";
import { decodeVersionedTransactionBase64 } from "../../simulation/tx-decode.js";
import { resolveAllAccountKeys } from "../../simulation/account-keys.js";
import { pickAccountsForSimulation } from "../../simulation/solana-simulator.js";
import { SimulationReplayEngine } from "../../simulation/replay.js";

const replayRequestSchema = z.object({
  cluster: clusterSchema,
  transactionBase64: z.string().min(1),
  slot: z.number().int().positive().optional(),
});

export function registerReplayRoute(
  app: FastifyInstance,
  deps: AnalyzeDeps,
) {
  app.post("/v1/replay", async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = replayRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "BAD_REQUEST",
        message: "Invalid replay request",
        details: parsed.error.flatten(),
      });
    }

    try {
      const tx = decodeVersionedTransactionBase64(parsed.data.transactionBase64);
      const adapter = deps.createRpc(parsed.data.cluster);
      const resolved = await resolveAllAccountKeys(tx, adapter);
      const accountKeys = pickAccountsForSimulation(
        resolved.allKeys,
        deps.config.maxSimulationAccounts,
      );

      const engine = new SimulationReplayEngine(deps.config, deps.createRpc);
      const result = await engine.replayAtSlot({
        cluster: parsed.data.cluster,
        tx,
        accountKeysForAccountsField: accountKeys,
        slot: parsed.data.slot,
      });

      return reply.send(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      req.log.error({ err: e }, "Replay error");
      return reply.status(500).send({ error: "REPLAY_ERROR", message: msg });
    }
  });
}
