import { SwigApiClient } from "@swig-wallet/api";
import bs58 from "bs58";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function json(status: number, body: unknown) {
  return Response.json(body, { status });
}

function getApiKey(payload: Record<string, unknown>): string | null {
  const apiKey =
    typeof payload.apiKey === "string" && payload.apiKey.trim()
      ? payload.apiKey.trim()
      : process.env.SWIG_API_KEY?.trim() || "";
  return apiKey || null;
}

export async function POST(request: NextRequest) {
  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: "BAD_REQUEST", message: "JSON body okunamadi." });
  }

  const action = payload.action;
  if (action !== "getPolicy" && action !== "createWallet") {
    return json(400, { error: "BAD_REQUEST", message: "Gecersiz Swig action." });
  }

  const apiKey = getApiKey(payload);
  if (!apiKey) {
    return json(400, {
      error: "MISSING_API_KEY",
      message: "SWIG_API_KEY env veya istek body icinde apiKey gerekli.",
    });
  }

  const client = new SwigApiClient({
    apiKey,
    portalUrl: "https://dashboard.onswig.com",
    paymasterUrl: "https://api.onswig.com",
  });

  if (action === "getPolicy") {
    const policyId = typeof payload.policyId === "string" ? payload.policyId.trim() : "";
    if (!policyId) {
      return json(400, { error: "BAD_REQUEST", message: "policyId gerekli." });
    }

    const { data, error } = await client.policies.get(policyId);
    if (error) {
      return json(error.status || 502, {
        error: error.code,
        message: error.message,
        details: error.details ?? null,
      });
    }

    return json(200, { ok: true, policy: data });
  }

  const policyId = typeof payload.policyId === "string" ? payload.policyId.trim() : "";
  const walletAddress = typeof payload.walletAddress === "string" ? payload.walletAddress.trim() : "";
  const network = payload.network === "mainnet" ? "mainnet" : "devnet";
  const swigId = typeof payload.swigId === "string" && payload.swigId.trim() ? payload.swigId.trim() : undefined;
  const paymasterPubkey =
    typeof payload.paymasterPubkey === "string" && payload.paymasterPubkey.trim()
      ? payload.paymasterPubkey.trim()
      : undefined;

  if (!policyId || !walletAddress) {
    return json(400, {
      error: "BAD_REQUEST",
      message: "policyId ve walletAddress gerekli.",
    });
  }

  const { data, error } = await client.wallet.create({
    policyId,
    walletAddress,
    walletType: "ED25519",
    network,
    swigId,
    paymasterPubkey,
  });

  if (error) {
    return json(error.status || 502, {
      error: error.code,
      message: error.message,
      details: error.details ?? null,
    });
  }

  if (!data) {
    return json(502, {
      error: "EMPTY_RESPONSE",
      message: "Swig wallet create cevabi bos dondu.",
    });
  }

  if ("transaction" in data) {
    const txBytes = bs58.decode(data.transaction);
    return json(200, {
      ok: true,
      mode: "unsigned",
      swigId: data.swigId,
      swigAddress: data.swigAddress,
      transactionBase58: data.transaction,
      transactionBase64: Buffer.from(txBytes).toString("base64"),
    });
  }

  return json(200, {
    ok: true,
    mode: "paymaster",
    swigId: data.swigId,
    swigAddress: data.swigAddress,
    signature: data.signature,
  });
}
