/**
 * Inpage entry point. Runs in the page's MAIN world.
 *
 * Registers the BLACKTHORN wallet via the Wallet Standard custom-event
 * protocol — dApps using @solana/wallet-adapter or @wallet-standard/app
 * pick us up automatically.
 *
 * Spec: docs/extension-architecture.md §6.
 */

import { registerWallet } from "@wallet-standard/wallet";
import { blackthornWallet } from "./wallet-standard";
import { installX402Interceptor } from "./x402-interceptor";

try {
  registerWallet(blackthornWallet);
  console.info("[BLACKTHORN] wallet registered");
} catch (err) {
  console.error("[BLACKTHORN] wallet registration failed:", err);
}

try {
  installX402Interceptor();
} catch (err) {
  console.error("[BLACKTHORN] x402 interceptor failed:", err);
}
