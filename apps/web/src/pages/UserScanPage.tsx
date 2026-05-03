import { useCallback, useState } from "react";
import { useApiKey } from "../context/ApiKeyContext.js";
import { generateUnsignedDevnetSampleTx } from "../lib/sampleTx.js";
import type { Cluster } from "../lib/types.js";

type AnalyzeJson = {
  safe?: boolean;
  reasons?: string[];
  riskFindings?: { code: string; severity: string; message: string }[];
  meta?: { cluster?: string; confidence?: string };
};

function clusterLabel(c: Cluster): string {
  if (c === "mainnet-beta") return "Mainnet";
  if (c === "devnet") return "Devnet";
  return "Testnet";
}

export function UserScanPage() {
  const { apiKey, setApiKey, persistKey } = useApiKey();
  const [cluster, setCluster] = useState<Cluster>("devnet");
  const [txB64, setTxB64] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [parsed, setParsed] = useState<AnalyzeJson | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [rawOpen, setRawOpen] = useState(false);

  const fillSample = async () => {
    setLoading(true);
    setErr(null);
    try {
      const { base64 } = await generateUnsignedDevnetSampleTx();
      setTxB64(base64);
      setCluster("devnet");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const [policyMode, setPolicyMode] = useState<"strict" | "permissive">("strict");

  const analyze = async (overridePolicy?: Record<string, unknown>) => {
    setLoading(true);
    setErr(null);
    setParsed(null);
    setRaw(null);
    setStatus(null);
    const effectivePolicy =
      overridePolicy ??
      (policyMode === "permissive"
        ? { requireSuccessfulSimulation: false, allowWarnings: true }
        : {});
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
      const r = await fetch("/v1/analyze", {
        method: "POST",
        headers,
        body: JSON.stringify({
          cluster,
          transactionBase64: txB64.trim(),
          policy: effectivePolicy,
        }),
      });
      setStatus(r.status);
      const text = await r.text();
      setRaw(text);
      let j: unknown;
      try {
        j = JSON.parse(text) as unknown;
      } catch {
        j = null;
      }
      if (!r.ok) {
        if (j && typeof j === "object" && j !== null && "error" in j) {
          const er = j as { error?: { message?: string; code?: string } };
          setErr(
            [er.error?.code, er.error?.message].filter(Boolean).join(": ") || text,
          );
        } else {
          setErr(text.slice(0, 500));
        }
        return;
      }
      if (j && typeof j === "object" && j !== null && "safe" in j) {
        setParsed(j as AnalyzeJson);
      } else {
        setErr("Unexpected response shape");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const runSafeDemo = async () => {
    setLoading(true);
    setErr(null);
    setParsed(null);
    setRaw(null);
    setStatus(null);
    try {
      const { base64 } = await generateUnsignedDevnetSampleTx();
      setTxB64(base64);
      setCluster("devnet");
      setPolicyMode("permissive");
      const hdrs: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      if (apiKey.trim()) hdrs.Authorization = `Bearer ${apiKey.trim()}`;
      const r = await fetch("/v1/analyze", {
        method: "POST",
        headers: hdrs,
        body: JSON.stringify({
          cluster: "devnet",
          transactionBase64: base64,
          policy: { requireSuccessfulSimulation: false, allowWarnings: true },
        }),
      });
      setStatus(r.status);
      const text = await r.text();
      setRaw(text);
      let j: unknown;
      try {
        j = JSON.parse(text) as unknown;
      } catch {
        j = null;
      }
      if (!r.ok) {
        if (j && typeof j === "object" && j !== null && "error" in j) {
          const er = j as { error?: { message?: string; code?: string } };
          setErr(
            [er.error?.code, er.error?.message].filter(Boolean).join(": ") || text,
          );
        } else {
          setErr(text.slice(0, 500));
        }
        return;
      }
      if (j && typeof j === "object" && j !== null && "safe" in j) {
        setParsed(j as AnalyzeJson);
      } else {
        setErr("Unexpected response shape");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const safe = parsed?.safe === true;
  const showResult = parsed !== null && status !== null && status >= 200 && status < 300;

  const setClusterBtn = useCallback((c: Cluster) => () => setCluster(c), []);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <div className="mx-auto w-full max-w-7xl flex-1 p-6 md:p-8">
        <header className="mb-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-outline-variant/20 bg-surface-container-low px-3 py-1">
            <span className="security-pulse h-2 w-2 rounded-full bg-primary" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              Live API · POST /v1/analyze
            </span>
          </div>
          <h1 className="mb-2 font-headline text-3xl font-bold tracking-tight text-on-surface md:text-4xl">
            Security scan
          </h1>
          <p className="max-w-2xl leading-relaxed text-on-surface-variant">
            Send a VersionedTransaction (base64) to the backend; the server simulates on your chosen Solana
            cluster and returns a deterministic <code className="text-primary/90">safe</code> decision plus
            reasons and risk findings.
          </p>
        </header>

        <div className="grid grid-cols-12 gap-8">
          <section className="col-span-12 flex flex-col gap-8 lg:col-span-5">
            <div className="rounded-xl border border-transparent bg-surface-container p-6 shadow-lg transition-all duration-300 hover:border-outline-variant/10 md:p-8">
              <h2 className="mb-6 flex items-center gap-2 font-headline text-lg font-bold">
                <span className="material-symbols-outlined text-primary">data_object</span>
                Transaction input
              </h2>
              <div className="space-y-6">
                <div>
                  <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                    Cluster
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ["mainnet-beta", "Mainnet"],
                        ["devnet", "Devnet"],
                        ["testnet", "Testnet"],
                      ] as const
                    ).map(([c, label]) => (
                      <button
                        key={c}
                        type="button"
                        onClick={setClusterBtn(c)}
                        className={`rounded-lg border py-2 px-3 font-headline text-xs font-bold transition-all ${
                          cluster === c
                            ? "border-primary/30 bg-surface-container-highest text-primary"
                            : "border-outline-variant/10 bg-surface-container-low text-on-surface-variant hover:border-primary/30"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                    API key (Bearer)
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      onBlur={persistKey}
                      className="w-full rounded-lg border-none bg-surface-container-high py-3 pl-4 pr-10 text-sm text-on-surface placeholder:text-outline-variant focus:ring-1 focus:ring-primary"
                      placeholder="docker-demo-key or your key"
                      autoComplete="off"
                    />
                    <span className="material-symbols-outlined pointer-events-none absolute right-3 top-2.5 text-lg text-on-surface-variant">
                      vpn_key
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={persistKey}
                    className="mt-2 text-[10px] font-bold uppercase tracking-wider text-primary hover:underline"
                  >
                    Save to browser
                  </button>
                </div>
                <div>
                  <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                    Transaction base64
                  </label>
                  <textarea
                    value={txB64}
                    onChange={(e) => setTxB64(e.target.value)}
                    rows={6}
                    className="w-full resize-none rounded-lg border-none bg-surface-container-high py-3 px-4 font-mono text-sm text-secondary focus:ring-1 focus:ring-primary placeholder:text-outline-variant"
                    placeholder="Paste VersionedTransaction (base64)…"
                  />
                </div>
                <div className="pt-4">
                  <label className="mb-3 block text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                    Policy mode
                  </label>
                  <div className="mb-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPolicyMode("strict")}
                      className={`rounded-lg border py-2 px-3 text-xs font-bold transition-all ${
                        policyMode === "strict"
                          ? "border-error/30 bg-error/10 text-error"
                          : "border-outline-variant/10 bg-surface-container-low text-on-surface-variant hover:border-error/30"
                      }`}
                    >
                      Strict (default)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPolicyMode("permissive")}
                      className={`rounded-lg border py-2 px-3 text-xs font-bold transition-all ${
                        policyMode === "permissive"
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-outline-variant/10 bg-surface-container-low text-on-surface-variant hover:border-primary/30"
                      }`}
                    >
                      Permissive
                    </button>
                  </div>
                  <p className="mb-4 text-[10px] text-on-surface-variant">
                    {policyMode === "strict"
                      ? "Simulation must succeed — unsigned demo tx → BLOCK / RISK (expected)."
                      : "Simulation failure tolerated — unsigned demo tx → SAFE (demonstrates flexible policy)."}
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    disabled={loading || !txB64.trim()}
                    onClick={() => analyze()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-primary to-primary-container py-4 font-headline font-bold uppercase tracking-widest text-on-primary transition-all duration-200 hover:scale-[1.02] active:scale-95 disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                      security
                    </span>
                    {loading ? "Analyzing…" : "Analyze transaction"}
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={fillSample}
                    className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-low py-3 font-headline text-[10px] font-bold uppercase tracking-widest text-on-surface-variant transition-all hover:bg-surface-container-highest disabled:opacity-40"
                  >
                    Fill sample devnet TX
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={runSafeDemo}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 py-3 font-headline text-[10px] font-bold uppercase tracking-widest text-primary transition-all hover:bg-primary/20 disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-sm">verified_user</span>
                    One-click SAFE demo
                  </button>
                </div>
              </div>
            </div>

            {err ? (
              <div className="flex items-start gap-4 rounded-r-lg border-l-4 border-error bg-error-container/10 p-4">
                <span className="material-symbols-outlined text-error">error</span>
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-error">
                    {status !== null ? `HTTP ${status}` : "Request failed"}
                  </p>
                  <p className="text-xs text-on-error-container">{err}</p>
                </div>
              </div>
            ) : null}
          </section>

          <section className="col-span-12 space-y-8 lg:col-span-7">
            {showResult ? (
              <div className="relative overflow-hidden rounded-xl bg-surface-container p-6 shadow-lg md:p-8">
                <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/5 blur-[100px]" />
                <div className="relative mb-8 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="mb-1 font-headline text-lg font-bold">Analysis results</h2>
                    <p className="text-xs uppercase tracking-[0.15em] text-on-surface-variant">
                      Policy + simulation outcome
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-lg px-2 py-1 text-[9px] font-bold uppercase ${
                      policyMode === "strict"
                        ? "bg-error/10 text-error"
                        : "bg-primary/10 text-primary"
                    }`}>
                      {policyMode} policy
                    </span>
                  </div>
                  <div
                    className={`flex items-center gap-3 rounded-full border px-4 py-2 ${
                      safe
                        ? "border-primary/20 bg-primary/10"
                        : "border-error/30 bg-error/10"
                    }`}
                  >
                    <span
                      className={`h-3 w-3 rounded-full ${safe ? "security-pulse bg-primary" : "bg-error"}`}
                    />
                    <span
                      className={`font-headline text-sm font-bold tracking-tighter ${
                        safe ? "text-primary" : "text-error"
                      }`}
                    >
                      {safe ? "SAFE" : "BLOCK / RISK"}
                    </span>
                  </div>
                </div>

                <div className="relative mb-10 grid grid-cols-1 gap-8 sm:grid-cols-2">
                  <div>
                    <h3 className="mb-4 text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                      Meta
                    </h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between border-b border-outline-variant/10 py-2">
                        <span className="text-on-surface-variant">Cluster</span>
                        <span className="font-mono text-primary">
                          {parsed.meta?.cluster ?? clusterLabel(cluster)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-b border-outline-variant/10 py-2">
                        <span className="text-on-surface-variant">Confidence</span>
                        <span className="font-mono text-tertiary">
                          {parsed.meta?.confidence ?? "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="mb-4 text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                      Reasons
                    </h3>
                    {parsed.reasons?.length ? (
                      <ul className="space-y-3">
                        {parsed.reasons.map((r, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs leading-tight">
                            <span className="material-symbols-outlined text-base text-primary">check_circle</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-on-surface-variant">No policy reasons returned.</p>
                    )}
                  </div>
                </div>

                {safe && parsed.riskFindings?.length ? (
                  <div className="mb-6 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <span className="material-symbols-outlined text-primary">info</span>
                    <div className="text-xs leading-relaxed text-on-surface-variant">
                      <strong className="text-on-surface">SAFE with findings:</strong> the policy allowed this
                      transaction despite risk signals. Findings below are informational — the policy engine
                      decided they are not blocking under the current configuration.
                    </div>
                  </div>
                ) : null}

                <h3 className="mb-4 text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                  Risk findings
                </h3>
                <div className="overflow-hidden rounded-lg border border-outline-variant/10 bg-surface-container-low">
                  {parsed.riskFindings?.length ? (
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="bg-surface-container-high/50 text-[10px] uppercase tracking-[0.1em]">
                          <th className="px-4 py-3 font-bold">Code</th>
                          <th className="px-4 py-3 font-bold">Severity</th>
                          <th className="px-4 py-3 font-bold">Message</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/10">
                        {parsed.riskFindings.map((f, i) => (
                          <tr key={i}>
                            <td className="px-4 py-4 font-mono text-xs text-on-surface-variant">{f.code}</td>
                            <td className="px-4 py-4">
                              <span
                                className={`rounded border px-2 py-0.5 text-[9px] font-bold ${
                                  f.severity === "high"
                                    ? "border-error/20 bg-error/10 text-error"
                                    : f.severity === "medium"
                                      ? "border-tertiary/20 bg-tertiary/10 text-tertiary"
                                      : "border-secondary/20 bg-secondary/10 text-secondary"
                                }`}
                              >
                                {f.severity}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-xs">{f.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="p-4 text-sm text-on-surface-variant">No risk findings.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-outline-variant/20 bg-surface-container/50 p-10 text-center text-on-surface-variant">
                <span className="material-symbols-outlined mb-4 text-4xl text-outline-variant">analytics</span>
                <p className="text-sm">Run an analysis to see verdict, reasons, and findings here.</p>
              </div>
            )}

            {raw ? (
              <div className="overflow-hidden rounded-xl border border-outline-variant/10 bg-surface-container-lowest">
                <button
                  type="button"
                  onClick={() => setRawOpen((o) => !o)}
                  className="group flex w-full items-center justify-between px-6 py-4 transition-colors hover:bg-surface-container-high"
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">code</span>
                    <span className="font-headline text-xs font-bold uppercase tracking-widest">
                      Raw response JSON
                    </span>
                  </div>
                  <span
                    className={`material-symbols-outlined transition-transform ${rawOpen ? "rotate-180" : ""}`}
                  >
                    expand_more
                  </span>
                </button>
                {rawOpen ? (
                  <div className="custom-scrollbar max-h-[420px] overflow-auto border-t border-outline-variant/10 p-6">
                    <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-primary">
                      {raw}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <button
        type="button"
        className="fixed bottom-10 right-10 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-[0_0_20px_rgba(143,245,255,0.4)] transition-all hover:scale-110 active:scale-95 lg:hidden"
        aria-label="Focus analyze"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      >
        <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
          add_moderator
        </span>
      </button>
    </div>
  );
}
