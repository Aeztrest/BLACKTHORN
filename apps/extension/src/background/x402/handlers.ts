/**
 * x402 review handler — runs when the inpage interceptor catches a 402
 * response and asks BLACKTHORN whether to pay.
 *
 * Pipeline (spec → docs/x402-defense.md):
 *   1. Validate PaymentRequirements (network, mint, fee-payer, etc.)
 *   2. Cluster matches the wallet's active network
 *   3. Mint allowlist (if policy set)
 *   4. Look up / auto-create allowance for (origin, asset)
 *   5. Apply caps (per-tx, hourly, daily)
 *   6. Build payment VersionedTransaction
 *   7. Enqueue sign request → user reviews via popup
 *   8. On approve: wrap signed bytes into PaymentPayload, return as
 *      `PAYMENT-SIGNATURE` header value
 *   9. On settle (response 200): increment ledger.recordHit
 */

import browser from "webextension-polyfill";
import { Buffer } from "buffer";
import { Keypair } from "@solana/web3.js";
import type { GuardPolicy } from "@blackthorn/swig-guard";
import { BALANCED_POLICY } from "@blackthorn/swig-guard";

import { useAuthority, isUnlocked } from "../crypto/session";
import { getConnection } from "../rpc/connection";
import { getSnapshot, dispatch } from "../state/store";
import { enqueue, newRequestId, type SignSuccess } from "../wallet-standard/sign-queue";
import {
  listAllowances, makeAllowanceId, recordHit, writeAllowance, readAllowance, type AllowanceRow,
} from "../db/allowances";
import { atomicToUi, validateRequirements, type PaymentRequirements } from "./parse";
import { buildX402Payment } from "./build";

const POLICY_STORAGE_KEY = "blackthorn.policy.v1";

interface ReviewRequest {
  origin: string;
  requestUrl: string;
  requirements: PaymentRequirements;
}

interface ApprovedDecision {
  action: "approve";
  headerValue: string;
}
interface DeclinedDecision {
  action: "decline";
  reason: string;
}
type Decision = ApprovedDecision | DeclinedDecision;

export async function x402Review(rawReq: unknown): Promise<Decision> {
  const { origin, requestUrl, requirements } = rawReq as ReviewRequest;

  if (!isUnlocked()) return { action: "decline", reason: "BLACKTHORN wallet is locked." };

  // 1. Spec validation
  const v = validateRequirements(requirements);
  if (!v.ok) return { action: "decline", reason: `Invalid PaymentRequirements: ${v.reason}` };
  const cluster = v.cluster!;

  // 2. Network match
  const snap = getSnapshot();
  if (snap.network !== cluster) {
    return { action: "decline", reason: `dApp asks for ${cluster}; wallet on ${snap.network}.` };
  }

  // 3. Policy + mint allowlist
  const policy = await loadPolicy();
  if (policy.allowedMints && policy.allowedMints.length > 0 && !policy.allowedMints.includes(requirements.asset)) {
    return { action: "decline", reason: `Asset ${requirements.asset} not on your trusted-mints list.` };
  }
  if (policy.blockedMerchantOrigins?.includes(origin)) {
    return { action: "decline", reason: `${origin} is on your blocked-merchants list.` };
  }
  if (policy.allowedMerchantOrigins && policy.allowedMerchantOrigins.length > 0
      && !policy.allowedMerchantOrigins.includes(origin)) {
    return { action: "decline", reason: `${origin} not on your allowed-merchants list.` };
  }
  if (policy.allowedFacilitators && policy.allowedFacilitators.length > 0
      && !policy.allowedFacilitators.includes(requirements.extra.feePayer)) {
    return { action: "decline", reason: `Facilitator ${requirements.extra.feePayer} not trusted.` };
  }

  // 4. Allowance lookup / auto-create
  const allowanceId = makeAllowanceId(origin, requirements.asset);
  let allowance = await readAllowance(allowanceId);
  if (!allowance) {
    allowance = await createDefaultAllowance(origin, requirements.asset, snap.authorityAddress!, policy);
  }
  if (allowance.status === "revoked") {
    return { action: "decline", reason: `${origin} has been revoked from your wallet.` };
  }
  if (allowance.status === "paused") {
    return { action: "decline", reason: `${origin} is paused. Resume from Allowances to continue.` };
  }

  // We need decimals to compare amounts. Build pulls them from chain — but we
  // don't want to fetch twice, so let the build do it once and apply caps after.

  // 5. Build the payment tx
  const conn = getConnection();
  const authority: Keypair = useAuthority();
  let built;
  try {
    built = await buildX402Payment(authority, requirements, conn);
  } catch (err) {
    return { action: "decline", reason: `Couldn't build payment: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Apply caps now that we know decimals.
  const amountUi = atomicToUi(requirements.amount, built.decimals);
  if (policy.maxX402PerTx !== undefined && amountUi > policy.maxX402PerTx) {
    return { action: "decline", reason: `Payment ${amountUi.toFixed(6)} exceeds your per-tx cap of ${policy.maxX402PerTx}.` };
  }

  // Refresh allowance after potential rollover; check hourly + daily.
  const HOUR = 60 * 60_000;
  const DAY  = 24 * HOUR;
  const now = Date.now();
  const projHour = (now - allowance.spentHourTs > HOUR ? 0 : allowance.spentHour) + amountUi;
  const projDay  = (now - allowance.spentDayTs  > DAY  ? 0 : allowance.spentDay)  + amountUi;

  if (allowance.capPerHour > 0 && projHour > allowance.capPerHour) {
    return { action: "decline", reason: `${origin}: would exceed ${allowance.capPerHour} hourly cap (${projHour.toFixed(6)}).` };
  }
  if (allowance.capPerDay > 0 && projDay > allowance.capPerDay) {
    return { action: "decline", reason: `${origin}: would exceed ${allowance.capPerDay} daily cap (${projDay.toFixed(6)}).` };
  }

  // 6. Enqueue sign request — user reviews in popup, returns signed bytes.
  const txBase64 = Buffer.from(built.transaction.serialize()).toString("base64");
  const result = await enqueueAndWait(origin, txBase64);
  if (!("signedTxBase64" in result) || !result.signedTxBase64) {
    return { action: "decline", reason: "Sign request did not return a signed transaction." };
  }

  // 7. Wrap into PaymentPayload (v2) for the PAYMENT-SIGNATURE header.
  const paymentPayload = {
    x402Version: 2,
    resource: { url: requestUrl, mimeType: "application/json" },
    accepted: requirements,
    payload: { transaction: result.signedTxBase64 },
  };
  const headerValue = btoa(JSON.stringify(paymentPayload));

  // 8. Increment allowance ledger (optimistic — we'll see drift if facilitator never settles).
  await recordHit(allowanceId, amountUi);

  return { action: "approve", headerValue };
}

/* ────────────── Helpers ────────────── */

async function enqueueAndWait(origin: string, txBase64: string): Promise<SignSuccess> {
  return new Promise<SignSuccess>((resolve, reject) => {
    const requestId = newRequestId();
    enqueue({ requestId, kind: "transaction", origin, payloadBase64: txBase64, resolve, reject });
    dispatch({ type: "sign.start" });
  });
}

async function loadPolicy(): Promise<GuardPolicy> {
  const all = await browser.storage.local.get(POLICY_STORAGE_KEY);
  return (all[POLICY_STORAGE_KEY] as GuardPolicy | undefined) ?? BALANCED_POLICY;
}

async function createDefaultAllowance(
  origin: string,
  asset: string,
  subKeyPubkey: string,
  policy: GuardPolicy,
): Promise<AllowanceRow> {
  const now = Date.now();
  const row: AllowanceRow = {
    id: makeAllowanceId(origin, asset),
    merchantOrigin: origin,
    asset,
    capPerTx:   policy.maxX402PerTx   ?? 1.00,
    capPerHour: policy.x402HourlyCap  ?? 5.00,
    capPerDay:  policy.x402DailyCap   ?? 25.00,
    spentTx: 0,
    spentHour: 0,
    spentHourTs: now,
    spentDay: 0,
    spentDayTs: now,
    hits: 0,
    lastHitAt: null,
    expiresAt: null,
    status: "active",
    subKeyPubkey,  // T28 will replace this with a per-merchant Swig sub-key.
    createdAt: now,
    updatedAt: now,
  };
  await writeAllowance(row);
  return row;
}
