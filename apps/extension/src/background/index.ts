/**
 * Background service worker entry.
 * Spec: docs/extension-architecture.md §3.
 *
 * Lifecycle: this file runs every time Chrome wakes the worker. Heavy
 * subsystems (RPC sockets, IndexedDB) are opened on-demand by their callers,
 * not here, so the cold-start path stays under 50 ms.
 */

import browser from "webextension-polyfill";
import { startRouter } from "./messaging/router";
import { dispatch, rehydrate } from "./state/store";
import { INITIAL_STATE } from "./state/machine";
import { hasKeystore, readKeystore } from "./db/keystore";
import { startMonitorLifecycle } from "./rpc/monitor";
import { countUnread } from "./db/alerts";
import { Buffer } from "buffer";
import { findSwigPda } from "@swig-wallet/classic";

async function bootstrap(): Promise<void> {
  // Cold-boot rehydrate: figure out what phase we're in based on persistent state.
  const exists = await hasKeystore();
  if (!exists) {
    rehydrate({ ...INITIAL_STATE, phase: "uninitialized" });
    return;
  }

  // Keystore exists but session is locked (worker just woke; secret never persisted).
  const row = await readKeystore();
  if (!row) {
    rehydrate({ ...INITIAL_STATE, phase: "uninitialized" });
    return;
  }
  const swigPda = findSwigPda(Buffer.from(row.swigIdB64, "base64")).toBase58();

  // Re-hydrate the alert count from IndexedDB so the popup badge is accurate
  // immediately on cold boot (before the user opens the popup).
  let alertsUnread = 0;
  try { alertsUnread = await countUnread(); } catch { /* IndexedDB might not be open yet */ }

  rehydrate({
    ...INITIAL_STATE,
    phase: "locked",
    walletAddress: swigPda,
    authorityAddress: row.authorityPubkey,
    alertsUnread,
  });
  void dispatch; // dispatch is consumed by the monitor lifecycle below
}

// Entry
browser.runtime.onInstalled.addListener(({ reason }) => {
  console.info(`[BLACKTHORN] installed (${reason})`);
});

void bootstrap().catch((err) => {
  console.error("[BLACKTHORN] bootstrap failed:", err);
});

startRouter();
startMonitorLifecycle();
