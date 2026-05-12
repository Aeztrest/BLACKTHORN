/**
 * Post-sign monitor.
 *
 * Subscribes to on-chain log events for the user's authority + smart-wallet
 * addresses. Every confirmed signature is reconciled against the local
 * history table (T26). Unmatched signatures trigger a *drift alert* —
 * something moved from the wallet that BLACKTHORN never approved.
 *
 * Spec: docs/extension-architecture.md §3.2 (lifecycle constraints) +
 *       docs/x402-defense.md §6 (drift attack).
 *
 * MV3 caveats:
 * - The WebSocket lives only as long as the service worker. When Chrome puts
 *   the worker to sleep, the subscription dies. On wake, `start()` is called
 *   again, and `backfill()` walks getSignaturesForAddress to replay anything
 *   that landed during the sleep window.
 * - We persist `lastSeenSig` in chrome.storage.local so backfill knows where
 *   to stop.
 */

import browser from "webextension-polyfill";
import { Connection, PublicKey, type Logs } from "@solana/web3.js";
import { getConnection } from "./connection";
import { appendAlert, countUnread } from "../db/alerts";
import { appendHistory, listHistory } from "../db/history";
import { dispatch, subscribe, getState } from "../state/store";

const LAST_SEEN_KEY = "blackthorn.monitor.lastSeen.v1";

interface LastSeen {
  authority?: { signature: string; slot: number };
  wallet?:    { signature: string; slot: number };
}

class Monitor {
  private conn: Connection | null = null;
  private authoritySub: number | null = null;
  private walletSub: number | null = null;
  private authorityPk: PublicKey | null = null;
  private walletPk: PublicKey | null = null;
  private running = false;

  async start(authorityAddress: string, walletAddress: string): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.authorityPk = new PublicKey(authorityAddress);
    this.walletPk    = new PublicKey(walletAddress);
    this.conn = getConnection();

    // Replay anything that confirmed while we were asleep.
    void this.backfill();

    // Live subscriptions — every tx mentioning these accounts will fire.
    this.authoritySub = this.conn.onLogs(this.authorityPk, (logs, ctx) => {
      void this.handle(logs, ctx.slot, "authority");
    }, "confirmed");

    this.walletSub = this.conn.onLogs(this.walletPk, (logs, ctx) => {
      void this.handle(logs, ctx.slot, "wallet");
    }, "confirmed");

    console.info("[BLACKTHORN] post-sign monitor live for", authorityAddress.slice(0, 8) + "…");
  }

  async stop(): Promise<void> {
    if (!this.running || !this.conn) { this.running = false; return; }
    if (this.authoritySub !== null) {
      try { await this.conn.removeOnLogsListener(this.authoritySub); } catch { /* ignore */ }
      this.authoritySub = null;
    }
    if (this.walletSub !== null) {
      try { await this.conn.removeOnLogsListener(this.walletSub); } catch { /* ignore */ }
      this.walletSub = null;
    }
    this.running = false;
    this.authorityPk = null;
    this.walletPk = null;
    this.conn = null;
  }

  private async handle(logs: Logs, slot: number, scope: "authority" | "wallet"): Promise<void> {
    const sig = logs.signature;
    if (!sig) return;
    if (logs.err) {
      // Failed txs are noise for the user — record a low-severity history entry but no alert.
      await appendHistory({
        type: "alert",
        signature: sig,
        origin: null,
        summary: `Failed transaction touched your ${scope === "wallet" ? "smart wallet" : "authority"}`,
        decision: "block",
        reasons: ["Simulation/execution error on-chain"],
        broadcast: false,
        createdAt: Date.now(),
      });
      return;
    }
    await this.reconcileSignature(sig, slot, scope);
  }

  private async reconcileSignature(signature: string, slot: number, scope: "authority" | "wallet"): Promise<void> {
    // Persist the cursor so backfill knows where to stop next time.
    await this.bumpLastSeen(scope, signature, slot);

    // Did we record this signature when popup approved? If so, mark settled
    // and move on. (We log signatures only for `transactionAndSend`; bare
    // `transaction` mode hands the signed bytes back to the dApp without us
    // seeing the on-chain sig — those land here via drift detection too,
    // which is fine because the dApp's broadcast is the user's intent.)
    const recent = await listHistory({ limit: 200 });
    const matched = recent.find((h) => h.signature === signature);
    if (matched) return;  // legitimate

    // Unknown signature — drift.
    await appendAlert({
      severity: "high",
      kind: "drift",
      merchantOrigin: "unknown",
      signature,
      body: `An unsigned transaction touched your ${scope === "wallet" ? "smart wallet" : "authority"}.`,
      createdAt: Date.now(),
      dismissedAt: null,
    });

    await appendHistory({
      type: "alert",
      signature,
      origin: null,
      summary: `Drift detected — unauthorized tx on ${scope === "wallet" ? "smart wallet" : "authority"}`,
      decision: "block",
      reasons: ["BLACKTHORN didn't sign this transaction. Investigate before continuing."],
      broadcast: false,
      createdAt: Date.now(),
    });

    // Bump unread count.
    const total = await countUnread();
    dispatch({ type: "alerts.set", count: total });

    // Push notification — uses the icon shipped with the extension.
    try {
      browser.notifications.create(`bx-drift-${signature.slice(0, 12)}`, {
        type: "basic",
        iconUrl: browser.runtime.getURL("icons/128.png"),
        title: "Unexpected payment from your wallet",
        message: "BLACKTHORN didn't approve this transaction. Open the wallet to investigate.",
      });
    } catch (err) {
      console.warn("[BLACKTHORN] notification failed:", err);
    }
  }

  private async backfill(): Promise<void> {
    if (!this.conn || !this.authorityPk) return;
    const last = await readLastSeen();

    // Authority backfill
    try {
      const sigs = await this.conn.getSignaturesForAddress(this.authorityPk, { limit: 50 });
      for (const info of sigs) {
        if (last.authority && info.signature === last.authority.signature) break;
        await this.reconcileSignature(info.signature, info.slot, "authority");
      }
    } catch (err) {
      console.warn("[BLACKTHORN] authority backfill failed:", err);
    }

    // Wallet backfill
    if (this.walletPk) {
      try {
        const sigs = await this.conn.getSignaturesForAddress(this.walletPk, { limit: 50 });
        for (const info of sigs) {
          if (last.wallet && info.signature === last.wallet.signature) break;
          await this.reconcileSignature(info.signature, info.slot, "wallet");
        }
      } catch (err) {
        console.warn("[BLACKTHORN] wallet backfill failed:", err);
      }
    }
  }

  private async bumpLastSeen(scope: "authority" | "wallet", signature: string, slot: number): Promise<void> {
    const last = await readLastSeen();
    last[scope] = { signature, slot };
    await browser.storage.local.set({ [LAST_SEEN_KEY]: last });
  }
}

async function readLastSeen(): Promise<LastSeen> {
  const all = await browser.storage.local.get(LAST_SEEN_KEY);
  return (all[LAST_SEEN_KEY] as LastSeen | undefined) ?? {};
}

const monitor = new Monitor();

/**
 * Wire the monitor to the wallet state machine. Starts when phase becomes
 * "ready" with an authority + walletAddress, stops when leaving that phase.
 */
export function startMonitorLifecycle(): void {
  // Subscribe to state diffs — start/stop based on phase.
  subscribe((next, prev) => {
    const reachedReady = next.phase === "ready" && prev.phase !== "ready";
    const leftReady    = prev.phase === "ready" && next.phase !== "ready";

    if (reachedReady && next.authorityAddress && next.walletAddress) {
      void monitor.start(next.authorityAddress, next.walletAddress);
    }
    if (leftReady) {
      void monitor.stop();
    }
  });

  // Cold-boot: if state is already ready when this runs, fire start.
  const s = getState();
  if (s.phase === "ready" && s.authorityAddress && s.walletAddress) {
    void monitor.start(s.authorityAddress, s.walletAddress);
  }
}
