/**
 * x402 demo paywall route — `/demo/scrybe?q=<question>`.
 *
 * Real x402 endpoint backed by PayAI's public devnet facilitator. Unauthenticated
 * requests get HTTP 402 + PaymentRequirements. Authenticated requests
 * (PAYMENT-SIGNATURE header populated by the BLACKTHORN extension) get the
 * resource after on-chain settlement.
 *
 * No mocking — settlement is a real Solana devnet transaction.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { FacilitatorClient } from "../../x402/facilitator-client.js";
import { loadMerchantConfig, MerchantConfigError } from "../../x402/merchant-config.js";

interface ScrybeQuery {
  q?: string;
}

const STOCK_ANSWERS: Record<string, string> = {
  marinade: "Marinade Finance currently routes ~$284M of liquid SOL across 62 validator partners.",
  jito:     "Jito's stake-weighted MEV redistribution averages 6 % above-baseline yield for jitoSOL holders.",
  jupiter:  "Jupiter aggregates Phoenix + Raydium + Orca + Meteora; default route uses 0.1 % slippage tolerance.",
  usdc:     "USDC on Solana is issued by Circle. Mainnet mint: EPjF…Dt1v · Devnet mint: 4zMM…ncDU (6 decimals).",
};

function answerFor(q: string): string {
  const lower = q.toLowerCase();
  for (const [key, val] of Object.entries(STOCK_ANSWERS)) {
    if (lower.includes(key)) return val;
  }
  return `Echo (${q.length} chars): ${q.slice(0, 200)}`;
}

export function registerDemoPaywallRoute(app: FastifyInstance): void {
  let merchant: ReturnType<typeof loadMerchantConfig>;
  try {
    merchant = loadMerchantConfig();
  } catch (err) {
    if (err instanceof MerchantConfigError) {
      app.log.warn(`x402 demo paywall disabled: ${err.message}`);
      return;
    }
    throw err;
  }

  const facilitator = new FacilitatorClient({ baseUrl: merchant.facilitatorUrl });

  app.get<{ Querystring: ScrybeQuery }>("/demo/scrybe", async (req, reply) => {
    const q = (req.query.q ?? "").trim();
    if (!q) return reply.code(400).send({ error: "Missing ?q parameter" });
    if (q.length > 500) return reply.code(400).send({ error: "Question too long (max 500 chars)" });

    const headerValue = pickHeader(req, "payment-signature") ?? pickHeader(req, "x-payment");
    const requirements = await buildRequirements(facilitator, merchant, q);

    if (!headerValue) {
      return send402(reply, requirements);
    }

    let payload: ReturnType<typeof decodePaymentPayload>;
    try { payload = decodePaymentPayload(headerValue); }
    catch (err) {
      return reply.code(400).send({
        error: "Malformed PAYMENT-SIGNATURE header",
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    // Verify with the facilitator. If it rejects, return 402 with the original
    // requirements + the reason so the client can decide what to do.
    const verifyRes = await facilitator.verify(payload, requirements).catch((err) => ({
      isValid: false as const,
      invalidReason: err instanceof Error ? err.message : String(err),
    }));
    if (!verifyRes.isValid) {
      reply.code(402);
      reply.header("PAYMENT-REQUIRED", base64(JSON.stringify({
        x402Version: 2, accepts: [requirements], error: verifyRes.invalidReason ?? "verification_failed",
      })));
      return reply.send({
        x402Version: 2, accepts: [requirements],
        error: "Payment verification failed",
        detail: verifyRes.invalidReason,
      });
    }

    // Settle. This is the real on-chain submit; PayAI co-signs and broadcasts.
    const settleRes = await facilitator.settle(payload, requirements).catch((err) => ({
      success: false as const,
      errorReason: err instanceof Error ? err.message : String(err),
    }));
    if (!settleRes.success) {
      return reply.code(502).send({
        error: "Settlement failed at facilitator",
        detail: settleRes.errorReason,
      });
    }

    // 200 + resource. PAYMENT-RESPONSE header carries the on-chain proof so
    // the BLACKTHORN extension can reconcile against its allowance ledger.
    reply.header("PAYMENT-RESPONSE", base64(JSON.stringify({
      success: true,
      transaction: settleRes.transaction,
      network: settleRes.network ?? requirements.network,
      payer: settleRes.payer,
    })));
    return reply.send({
      answer: answerFor(q),
      paid: true,
      settlement: settleRes.transaction,
      payer: settleRes.payer,
    });
  });

  app.log.info(
    `x402 demo paywall live: GET /demo/scrybe (merchant=${merchant.merchantPubkey.toBase58().slice(0, 8)}…, network=${merchant.network})`,
  );
}

/* ────────────── Helpers ────────────── */

async function buildRequirements(
  facilitator: FacilitatorClient,
  merchant: ReturnType<typeof loadMerchantConfig>,
  q: string,
) {
  // Query the facilitator for its current devnet signer. If unreachable,
  // fall back to a cached value or fail loud — better than emitting bad reqs.
  const feePayer = await facilitator.resolveFeePayer(merchant.network).catch(() => null);
  if (!feePayer) {
    throw new Error(`Facilitator at ${merchant.facilitatorUrl} did not return a feePayer for ${merchant.network}`);
  }

  return {
    scheme: "exact",
    network: merchant.network,
    asset: merchant.usdcMint,
    amount: merchant.priceAtomic,
    payTo: merchant.merchantPubkey.toBase58(),
    maxTimeoutSeconds: 60,
    extra: {
      feePayer,
      memo: `scrybe-${Date.now()}-${randomNonce(8)}`,
      description: `Scrybe answer for: ${q.slice(0, 80)}`,
      mimeType: "application/json",
    },
  };
}

function send402(reply: FastifyReply, requirements: ReturnType<typeof buildRequirements> extends Promise<infer U> ? U : never) {
  reply.code(402);
  reply.header("PAYMENT-REQUIRED", base64(JSON.stringify({ x402Version: 2, accepts: [requirements] })));
  return reply.send({
    x402Version: 2,
    accepts: [requirements],
    error: "Payment required",
  });
}

function decodePaymentPayload(headerValue: string) {
  // Two-layer decode: base64 → JSON → payload.transaction itself is base64.
  const json = JSON.parse(Buffer.from(headerValue, "base64").toString("utf8"));
  if (!json || typeof json !== "object") throw new Error("payload is not an object");
  if (!json.payload || typeof json.payload.transaction !== "string") {
    throw new Error("payload.transaction missing");
  }
  if (!json.accepted || typeof json.accepted !== "object") {
    throw new Error("accepted requirements missing");
  }
  return json as {
    x402Version: 1 | 2;
    resource?: { url: string };
    accepted: Awaited<ReturnType<typeof buildRequirements>>;
    payload: { transaction: string };
  };
}

function pickHeader(req: FastifyRequest, name: string): string | null {
  const v = req.headers[name];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function base64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

function randomNonce(bytes: number): string {
  let hex = "";
  for (let i = 0; i < bytes; i++) hex += Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
  return hex;
}
