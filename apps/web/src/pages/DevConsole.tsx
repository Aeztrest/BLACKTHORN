import { useCallback, useMemo, useState } from "react";
import { useApiKey } from "../context/ApiKeyContext.js";
import { API_KEY_STORAGE } from "../lib/storage.js";
import { generateUnsignedDevnetSampleTx } from "../lib/sampleTx.js";
import type { Cluster } from "../lib/types.js";

type FormTab = "form" | "raw";

function cleanPolicy(p: {
  maxLossPercent: string;
  minPostUsdcBalance: string;
  minPostTokenMint: string;
  blockApprovalChanges: boolean;
  blockDelegateChanges: boolean;
  blockRiskyPrograms: boolean;
  blockUnknownProgramExposure: boolean;
  allowWarnings: boolean;
  requireSuccessfulSimulation: boolean;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (p.maxLossPercent.trim() !== "") {
    const n = Number(p.maxLossPercent);
    if (!Number.isNaN(n)) out.maxLossPercent = n;
  }
  if (p.minPostUsdcBalance.trim() !== "") {
    const n = Number(p.minPostUsdcBalance);
    if (!Number.isNaN(n)) out.minPostUsdcBalance = n;
  }
  if (p.minPostTokenMint.trim()) out.minPostTokenMint = p.minPostTokenMint.trim();
  if (p.blockApprovalChanges) out.blockApprovalChanges = true;
  if (p.blockDelegateChanges) out.blockDelegateChanges = true;
  if (p.blockRiskyPrograms) out.blockRiskyPrograms = true;
  if (p.blockUnknownProgramExposure) out.blockUnknownProgramExposure = true;
  if (p.allowWarnings) out.allowWarnings = true;
  if (p.requireSuccessfulSimulation) out.requireSuccessfulSimulation = true;
  return out;
}

const defaultPolicy = () => ({
  maxLossPercent: "",
  minPostUsdcBalance: "",
  minPostTokenMint: "",
  blockApprovalChanges: false,
  blockDelegateChanges: false,
  blockRiskyPrograms: false,
  blockUnknownProgramExposure: false,
  allowWarnings: false,
  requireSuccessfulSimulation: false,
});

const POLICY_CHECKS: {
  key: keyof ReturnType<typeof defaultPolicy>;
  label: string;
  sub: string;
}[] = [
  { key: "blockApprovalChanges", label: "Block approval changes", sub: "Token allow / revoke" },
  { key: "blockDelegateChanges", label: "Block delegate changes", sub: "Stake / vote" },
  { key: "blockRiskyPrograms", label: "Block risky programs", sub: "Known risk list" },
  { key: "blockUnknownProgramExposure", label: "Block unknown programs", sub: "Strict exposure" },
  { key: "allowWarnings", label: "Allow warnings", sub: "Policy may pass with warnings" },
  { key: "requireSuccessfulSimulation", label: "Require successful simulation", sub: "Fail if sim errors" },
];

export function DevConsole() {
  const { apiKey, setApiKey, persistKey } = useApiKey();
  const [tab, setTab] = useState<FormTab>("form");
  const [cluster, setCluster] = useState<Cluster>("devnet");
  const [txB64, setTxB64] = useState("");
  const [userWallet, setUserWallet] = useState("");
  const [integratorRequestId, setIntegratorRequestId] = useState("");
  const [policy, setPolicy] = useState(defaultPolicy);
  const [rawJson, setRawJson] = useState(
    () =>
      JSON.stringify(
        { cluster: "devnet", transactionBase64: "", policy: {} },
        null,
        2,
      ),
  );

  const [healthOut, setHealthOut] = useState("");
  const [readyOut, setReadyOut] = useState("");
  const [analyzeOut, setAnalyzeOut] = useState("");
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const headers = useMemo(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey.trim()) h.Authorization = `Bearer ${apiKey.trim()}`;
    return h;
  }, [apiKey]);

  const runHealth = async () => {
    setLoading("health");
    setHealthOut("");
    try {
      const r = await fetch("/health");
      setHealthOut(`${r.status}\n${await r.text()}`);
    } catch (e) {
      setHealthOut(String(e));
    } finally {
      setLoading(null);
    }
  };

  const runReady = async () => {
    setLoading("ready");
    setReadyOut("");
    try {
      const r = await fetch("/health/ready");
      setReadyOut(`${r.status}\n${await r.text()}`);
    } catch (e) {
      setReadyOut(String(e));
    } finally {
      setLoading(null);
    }
  };

  const runAnalyze = async () => {
    setLoading("analyze");
    setAnalyzeOut("");
    setStatus(null);
    try {
      let body: unknown;
      if (tab === "raw") body = JSON.parse(rawJson) as unknown;
      else {
        body = {
          cluster,
          transactionBase64: txB64.trim(),
          policy: cleanPolicy(policy),
          ...(userWallet.trim() ? { userWallet: userWallet.trim() } : {}),
          ...(integratorRequestId.trim()
            ? { integratorRequestId: integratorRequestId.trim() }
            : {}),
        };
      }
      const r = await fetch("/v1/analyze", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      setStatus(r.status);
      const text = await r.text();
      try {
        setAnalyzeOut(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setAnalyzeOut(text);
      }
    } catch (e) {
      setAnalyzeOut(e instanceof Error ? e.message : String(e));
      setStatus(null);
    } finally {
      setLoading(null);
    }
  };

  const applyPreset = (id: string) => {
    switch (id) {
      case "missing_fields":
        setTab("raw");
        setRawJson(JSON.stringify({ cluster: "devnet" }, null, 2));
        break;
      case "empty_tx":
        setTab("form");
        setCluster("devnet");
        setTxB64("");
        break;
      case "invalid_b64":
        setTab("form");
        setCluster("devnet");
        setTxB64("not-valid-base64!!!");
        break;
      case "random_b64":
        setTab("form");
        setCluster("devnet");
        {
          const bytes = crypto.getRandomValues(new Uint8Array(48));
          setTxB64(btoa(String.fromCharCode(...bytes)));
        }
        break;
      case "strict_sim":
        setTab("form");
        setPolicy((p) => ({ ...p, requireSuccessfulSimulation: true }));
        break;
      case "permissive":
        setTab("form");
        setPolicy({ ...defaultPolicy(), allowWarnings: true });
        break;
      default:
        break;
    }
  };

  const generateUnsignedDevnetTx = async () => {
    setLoading("gen-tx");
    try {
      const { base64, feePayer } = await generateUnsignedDevnetSampleTx();
      setTab("form");
      setCluster("devnet");
      setTxB64(base64);
      setAnalyzeOut(
        JSON.stringify(
          {
            _note:
              "Unsigned sample tx — simulation often fails; useful for decode / pipeline checks.",
            feePayer,
          },
          null,
          2,
        ),
      );
      setStatus(null);
    } catch (e) {
      setAnalyzeOut(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  };

  const copyOut = useCallback(() => {
    if (analyzeOut) void navigator.clipboard.writeText(analyzeOut);
  }, [analyzeOut]);

  const pageOrigin = typeof window !== "undefined" ? window.location.origin : "";

  const statusBadge =
    status === null ? null : status >= 200 && status < 300 ? (
      <span className="rounded bg-primary/10 px-2 py-0.5 text-[9px] text-[#00F0FF]">HTTP {status}</span>
    ) : (
      <span className="rounded bg-error/10 px-2 py-0.5 text-[9px] text-error">HTTP {status}</span>
    );

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-surface">
      <div className="mx-auto max-w-6xl p-6 md:p-8">
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-on-surface-variant">
            <span>Terminal</span>
            <span className="material-symbols-outlined text-[12px]">chevron_right</span>
            <span className="text-primary">Console</span>
          </div>
          <h1 className="font-headline text-3xl font-bold tracking-tight text-on-surface md:text-4xl">
            Developer console
          </h1>
          <p className="mt-2 max-w-2xl text-on-surface-variant">
            Call{" "}
            <code className="rounded bg-surface-container-high px-1 text-primary">POST /v1/analyze</code> with
            full policy control. Origin <code className="text-primary/80">{pageOrigin || "—"}</code> · key
            storage <code className="text-primary/80">{API_KEY_STORAGE}</code>
          </p>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading !== null}
            onClick={runHealth}
            className="rounded-lg border border-outline-variant/20 bg-surface-container px-4 py-2 text-xs font-bold uppercase tracking-wider text-on-surface hover:border-primary/30 disabled:opacity-40"
          >
            GET /health
          </button>
          <button
            type="button"
            disabled={loading !== null}
            onClick={runReady}
            className="rounded-lg border border-outline-variant/20 bg-surface-container px-4 py-2 text-xs font-bold uppercase tracking-wider text-on-surface hover:border-primary/30 disabled:opacity-40"
          >
            GET /health/ready
          </button>
        </div>
        {(healthOut || readyOut) && (
          <div className="mb-8 grid gap-4 md:grid-cols-2">
            {healthOut ? (
              <pre className="custom-scrollbar max-h-40 overflow-auto rounded-xl bg-surface-container-low p-4 font-mono text-[11px] text-on-surface">
                {healthOut}
              </pre>
            ) : null}
            {readyOut ? (
              <pre className="custom-scrollbar max-h-40 overflow-auto rounded-xl bg-surface-container-low p-4 font-mono text-[11px] text-on-surface">
                {readyOut}
              </pre>
            ) : null}
          </div>
        )}

        <div className="mb-6 rounded-xl border border-outline-variant/10 bg-surface-container p-6">
          <h2 className="mb-2 font-headline text-xs font-bold uppercase tracking-widest text-on-surface-variant">
            Authentication
          </h2>
          <p className="mb-3 text-xs text-on-surface-variant">Docker default: docker-demo-key</p>
          <div className="flex flex-wrap gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="min-w-[200px] flex-1 rounded-lg border-none bg-surface-container-high py-3 px-4 text-sm text-on-surface focus:ring-1 focus:ring-primary"
              placeholder="API key (Bearer)"
            />
            <button
              type="button"
              onClick={persistKey}
              className="rounded-lg bg-primary px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-primary"
            >
              Save
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="flex flex-col gap-6 lg:col-span-7">
            <div className="w-fit rounded-xl bg-surface-container-low p-1">
              <button
                type="button"
                onClick={() => setTab("form")}
                className={`inline-flex items-center gap-2 rounded-lg px-6 py-2 text-sm font-medium transition-colors ${
                  tab === "form"
                    ? "bg-surface-container-highest text-primary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined text-sm">dynamic_form</span>
                Form mode
              </button>
              <button
                type="button"
                onClick={() => setTab("raw")}
                className={`inline-flex items-center gap-2 rounded-lg px-6 py-2 text-sm font-medium transition-colors ${
                  tab === "raw"
                    ? "bg-surface-container-highest text-primary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined text-sm">data_object</span>
                Raw JSON
              </button>
            </div>

            <div className="rounded-2xl border border-outline-variant/5 bg-surface-container p-6 shadow-xl md:p-8">
              {tab === "form" ? (
                <>
                  <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                        User wallet (optional)
                      </label>
                      <input
                        value={userWallet}
                        onChange={(e) => setUserWallet(e.target.value)}
                        className="w-full rounded-lg border-none bg-surface-container-high py-3 px-4 text-sm text-on-surface focus:ring-1 focus:ring-primary"
                        placeholder="Solana pubkey"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                        Integrator request id
                      </label>
                      <input
                        value={integratorRequestId}
                        onChange={(e) => setIntegratorRequestId(e.target.value)}
                        className="w-full rounded-lg border-none bg-surface-container-high py-3 px-4 text-sm text-on-surface focus:ring-1 focus:ring-primary"
                        placeholder="opaque string"
                      />
                    </div>
                  </div>
                  <div className="mb-6 space-y-2">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      Cluster
                    </label>
                    <select
                      value={cluster}
                      onChange={(e) => setCluster(e.target.value as Cluster)}
                      className="w-full max-w-xs rounded-lg border-none bg-surface-container-high py-3 px-4 text-sm text-on-surface focus:ring-1 focus:ring-primary"
                    >
                      <option value="devnet">devnet</option>
                      <option value="testnet">testnet</option>
                      <option value="mainnet-beta">mainnet-beta</option>
                    </select>
                  </div>
                  <div className="mb-8 space-y-2">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      transactionBase64
                    </label>
                    <textarea
                      value={txB64}
                      onChange={(e) => setTxB64(e.target.value)}
                      rows={8}
                      className="w-full resize-y rounded-lg border-none bg-surface-container-high py-3 px-4 font-mono text-xs text-on-surface focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <h3 className="mb-4 flex items-center gap-2 border-b border-outline-variant/10 pb-2 text-sm font-bold uppercase tracking-widest text-on-surface">
                    <span className="material-symbols-outlined text-sm">policy</span>
                    Policy flags
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {POLICY_CHECKS.map(({ key, label, sub }) => (
                      <label
                        key={key}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-surface-container-low p-4 transition-colors hover:bg-surface-container-high"
                      >
                        <div>
                          <span className="block text-xs font-semibold text-on-surface">{label}</span>
                          <span className="text-[9px] uppercase text-on-surface-variant">{sub}</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={Boolean(policy[key])}
                          onChange={(e) =>
                            setPolicy((p) => ({ ...p, [key]: e.target.checked }))
                          }
                          className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
                        />
                      </label>
                    ))}
                  </div>
                  <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase text-on-surface-variant">
                        maxLossPercent
                      </label>
                      <input
                        type="number"
                        value={policy.maxLossPercent}
                        onChange={(e) =>
                          setPolicy((p) => ({ ...p, maxLossPercent: e.target.value }))
                        }
                        className="w-full rounded-lg border-none bg-surface-container-high py-2 px-3 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase text-on-surface-variant">
                        minPostUsdcBalance
                      </label>
                      <input
                        type="number"
                        value={policy.minPostUsdcBalance}
                        onChange={(e) =>
                          setPolicy((p) => ({ ...p, minPostUsdcBalance: e.target.value }))
                        }
                        className="w-full rounded-lg border-none bg-surface-container-high py-2 px-3 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[10px] font-bold uppercase text-on-surface-variant">
                        minPostTokenMint
                      </label>
                      <input
                        value={policy.minPostTokenMint}
                        onChange={(e) =>
                          setPolicy((p) => ({ ...p, minPostTokenMint: e.target.value }))
                        }
                        className="w-full rounded-lg border-none bg-surface-container-high py-2 px-3 text-sm font-mono"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <textarea
                  value={rawJson}
                  onChange={(e) => setRawJson(e.target.value)}
                  rows={22}
                  className="w-full rounded-lg border-none bg-surface-container-high p-4 font-mono text-xs text-on-surface focus:ring-1 focus:ring-primary"
                />
              )}

              <div className="mt-8 border-t border-outline-variant/10 pt-8">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    Quick fill
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["empty_tx", "Empty TX"],
                      ["invalid_b64", "Invalid base64"],
                      ["random_b64", "Random base64"],
                      ["missing_fields", "Missing fields"],
                      ["strict_sim", "Strict sim"],
                      ["permissive", "Permissive"],
                    ] as const
                  ).map(([id, lab]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => applyPreset(id)}
                      className="rounded-lg border border-outline-variant/10 bg-surface-container-high px-3 py-1.5 text-[10px] font-bold text-[#a3aac4] transition-all hover:bg-surface-container-highest"
                    >
                      {lab}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={loading !== null}
                    onClick={generateUnsignedDevnetTx}
                    className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-1.5 text-[10px] font-bold text-primary transition-all hover:bg-primary/20 disabled:opacity-40"
                  >
                    Sample devnet tx
                  </button>
                </div>
              </div>

              <button
                type="button"
                disabled={loading !== null}
                onClick={runAnalyze}
                className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-primary-container to-primary py-4 font-bold text-on-primary shadow-[0_0_30px_rgba(143,245,255,0.15)] transition-all active:scale-[0.98] disabled:opacity-40"
              >
                <span className="material-symbols-outlined">send_and_archive</span>
                Execute analysis
              </button>
            </div>
          </div>

          <div className="flex flex-col lg:col-span-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-on-surface">
                <span className="material-symbols-outlined text-sm">terminal</span>
                Response
              </h3>
              <div className="flex items-center gap-2">
                {statusBadge}
                <button
                  type="button"
                  onClick={copyOut}
                  disabled={!analyzeOut}
                  className="text-outline-variant hover:text-white disabled:opacity-30"
                  aria-label="Copy response"
                >
                  <span className="material-symbols-outlined text-sm">content_copy</span>
                </button>
              </div>
            </div>
            <div className="flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-2xl border-l-2 border-primary bg-surface-container-lowest shadow-2xl lg:min-h-[480px]">
              <div className="flex items-center gap-4 border-b border-outline-variant/10 bg-surface-container-low px-4 py-2">
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-500/50" />
                  <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/50" />
                  <div className="h-2.5 w-2.5 rounded-full bg-green-500/50" />
                </div>
                <span className="font-mono text-[9px] uppercase tracking-tighter text-on-surface-variant">
                  analyze_response.json
                </span>
              </div>
              <pre className="custom-scrollbar flex-1 overflow-auto p-6 font-mono text-xs leading-relaxed text-[#8ff5ff]">
                {analyzeOut || "// Send a request to see formatted JSON here."}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
