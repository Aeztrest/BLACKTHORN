/**
 * Pending sign-request queue. Lives in the service worker between
 * `ws.signTransaction` (request arrives from a dApp via content script)
 * and `tx.sign` (popup UI's verdict from the user).
 *
 * Spec: docs/extension-architecture.md §3.
 */

export type SignKind = "message" | "transaction" | "transactionAndSend";

export interface SignRequest {
  requestId: string;
  kind: SignKind;
  origin: string;
  /** base64. For transactions: the serialized VersionedTransaction. For messages: the raw bytes. */
  payloadBase64: string;
  /**
   * When set, the sign queue pulls this sub-key's keypair from cache and
   * signs with it (per-merchant isolation). When unset, signs with the
   * main authority. Spec: docs/x402-defense.md §4.
   */
  signerPubkey?: string;
  /**
   * Free-form display label rendered in the popup. Useful for surfacing
   * non-obvious actions like "Provision per-merchant sub-key for X".
   */
  label?: string;
  resolve: (out: SignSuccess) => void;
  reject: (err: Error) => void;
}

export type SignSuccess =
  | { kind: "transaction"; signedTxBase64: string }
  | { kind: "transactionAndSend"; signedTxBase64: string; signature: string }
  | { kind: "message"; signatureBase64: string };

const queue = new Map<string, SignRequest>();

export function enqueue(req: SignRequest): void {
  queue.set(req.requestId, req);
}

export function take(requestId: string): SignRequest | undefined {
  const r = queue.get(requestId);
  if (r) queue.delete(requestId);
  return r;
}

export function peek(requestId: string): SignRequest | undefined {
  return queue.get(requestId);
}

export function size(): number {
  return queue.size;
}

export function snapshot(): { requestId: string; kind: SignKind; origin: string; payloadBase64: string; label?: string; signerPubkey?: string } | null {
  // Return the head of the queue (insertion order). We process one at a time.
  const first = queue.values().next();
  if (first.done) return null;
  const r = first.value;
  return {
    requestId: r.requestId,
    kind: r.kind,
    origin: r.origin,
    payloadBase64: r.payloadBase64,
    label: r.label,
    signerPubkey: r.signerPubkey,
  };
}

export function newRequestId(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += ((Math.random() * 65536) | 0).toString(16).padStart(4, "0");
  return s;
}
