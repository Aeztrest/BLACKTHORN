/**
 * DeltaG Content Script — intercepts Solana wallet signTransaction calls
 * by injecting a proxy into the page context that communicates with the
 * background service worker via window messages.
 */

const INJECT_SCRIPT = `
(function() {
  const DELTAG_CHANNEL = "__deltag_interceptor__";
  let requestId = 0;

  function createPendingPromise() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }

  const pending = new Map();

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.channel !== DELTAG_CHANNEL) return;
    if (event.data.direction !== "from_content") return;

    const { id, action, result } = event.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);

    if (action === "analysis_result") {
      if (result.safe || result.userApproved) {
        p.resolve(true);
      } else {
        p.reject(new Error("Transaction blocked by DeltaG: " + (result.reasons || []).join("; ")));
      }
    }
  });

  function interceptWallet(walletObj, name) {
    if (!walletObj || !walletObj.signTransaction) return;
    if (walletObj.__deltag_intercepted__) return;

    const originalSign = walletObj.signTransaction.bind(walletObj);

    walletObj.signTransaction = async function(transaction) {
      const id = ++requestId;
      let txBase64;
      try {
        const serialized = transaction.serialize();
        txBase64 = btoa(String.fromCharCode(...serialized));
      } catch(e) {
        return originalSign(transaction);
      }

      const { promise, resolve, reject } = createPendingPromise();
      pending.set(id, { resolve, reject });

      window.postMessage({
        channel: DELTAG_CHANNEL,
        direction: "to_content",
        id,
        action: "analyze_request",
        payload: { transactionBase64: txBase64 }
      }, "*");

      const timeoutMs = 30000;
      const timeout = setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          resolve(true);
        }
      }, timeoutMs);

      try {
        await promise;
      } catch(err) {
        clearTimeout(timeout);
        throw err;
      }
      clearTimeout(timeout);

      return originalSign(transaction);
    };

    walletObj.__deltag_intercepted__ = true;
  }

  function scanForWallets() {
    if (window.solana) interceptWallet(window.solana, "solana");
    if (window.phantom?.solana) interceptWallet(window.phantom.solana, "phantom");
    if (window.backpack?.solana) interceptWallet(window.backpack.solana, "backpack");
    if (window.solflare) interceptWallet(window.solflare, "solflare");
  }

  scanForWallets();

  const observer = new MutationObserver(() => scanForWallets());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  setInterval(scanForWallets, 2000);
})();
`;

const script = document.createElement("script");
script.textContent = INJECT_SCRIPT;
(document.head || document.documentElement).appendChild(script);
script.remove();

const DELTAG_CHANNEL = "__deltag_interceptor__";

window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  if (event.data?.channel !== DELTAG_CHANNEL) return;
  if (event.data.direction !== "to_content") return;

  const { id, action, payload } = event.data;

  if (action === "analyze_request") {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "analyze",
        transactionBase64: payload.transactionBase64,
      });

      window.postMessage({
        channel: DELTAG_CHANNEL,
        direction: "from_content",
        id,
        action: "analysis_result",
        result: response,
      }, "*");
    } catch (error) {
      window.postMessage({
        channel: DELTAG_CHANNEL,
        direction: "from_content",
        id,
        action: "analysis_result",
        result: { safe: true, reasons: ["Extension communication error"] },
      }, "*");
    }
  }
});
