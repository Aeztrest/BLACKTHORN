import { useCallback, useState } from "react";
import { useApiKey } from "../context/ApiKeyContext.js";
import { generateUnsignedDevnetSampleTx } from "../lib/sampleTx.js";

export type ScenarioRun = {
  runId: string;
  id: string;
  title: string;
  subtitle: string;
  status: number;
  durationMs: number;
  summary: string;
  interpretation: string;
  headers: Record<string, string>;
  bodyText: string;
  bodyJson: unknown;
};

function responseHeaders(r: Response): Record<string, string> {
  const o: Record<string, string> = {};
  r.headers.forEach((v, k) => {
    o[k] = v;
  });
  return o;
}

function paymentRelatedHeaders(h: Record<string, string>): [string, string][] {
  return Object.entries(h).filter(
    ([k]) =>
      /payment|x402|402/i.test(k) || k.toLowerCase().includes("www-authenticate"),
  );
}

async function runScenario(
  id: string,
  title: string,
  subtitle: string,
  exec: () => Promise<Response>,
): Promise<Omit<ScenarioRun, "runId">> {
  const t0 = performance.now();
  const r = await exec();
  const durationMs = Math.round(performance.now() - t0);
  const bodyText = await r.text();
  let bodyJson: unknown = null;
  try {
    bodyJson = JSON.parse(bodyText) as unknown;
  } catch {
    bodyJson = null;
  }
  const headers = responseHeaders(r);
  let summary = `HTTP ${r.status} · ${bodyText.length} bytes`;
  let interpretation = "";

  if (r.status === 200) {
    interpretation =
      "Successful response — health, readiness, or analyze JSON as applicable.";
  } else if (r.status === 400) {
    interpretation =
      "Invalid body or transaction — expected for the missing-field scenario.";
  } else if (r.status === 401) {
    interpretation =
      "Missing or invalid API key when the server requires Bearer auth.";
  } else if (r.status === 402) {
    const payHdrs = paymentRelatedHeaders(headers);
    interpretation =
      "HTTP 402 Payment Required — inspect payment / x402 headers below. Client must satisfy facilitator flow.";
    if (payHdrs.length) summary += ` · ${payHdrs.length} payment header(s)`;
  } else if (r.status === 502 || r.status === 504) {
    interpretation = "Upstream RPC timeout or facilitator error possible.";
  } else if (r.status === 503) {
    interpretation = "Readiness failure — RPC or optional facilitator not ready.";
  } else {
    interpretation = "Review status and body.";
  }

  return {
    id,
    title,
    subtitle,
    status: r.status,
    durationMs,
    summary,
    interpretation,
    headers,
    bodyText,
    bodyJson,
  };
}

const SCENARIOS = [
  { id: "health" as const, method: "GET", path: "/health", hint: "Liveness" },
  { id: "ready" as const, method: "GET", path: "/health/ready", hint: "RPC + optional x402 ready" },
  {
    id: "bad400" as const,
    method: "POST",
    path: "/v1/analyze",
    hint: "Missing transactionBase64",
    badge: "400",
    tone: "tertiary" as const,
  },
  {
    id: "noauth" as const,
    method: "POST",
    path: "/v1/analyze",
    hint: "No Authorization header",
    badge: "401/402",
    tone: "error" as const,
  },
  {
    id: "happy" as const,
    method: "POST",
    path: "/v1/analyze",
    hint: "Bearer + sample devnet tx",
    badge: "200",
    tone: "primary" as const,
  },
];

export function JuryLabPage() {
  const { apiKey } = useApiKey();
  const effectiveKey = () => apiKey.trim() || "docker-demo-key";

  const [runs, setRuns] = useState<ScenarioRun[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const pushRun = useCallback((run: Omit<ScenarioRun, "runId">) => {
    const full: ScenarioRun = { ...run, runId: `${run.id}-${Date.now()}` };
    setRuns((prev) => [full, ...prev]);
    setSelected(full.runId);
  }, []);

  const runOne = async (id: string) => {
    setLoading(id);
    try {
      let run: Omit<ScenarioRun, "runId">;
      switch (id) {
        case "health":
          run = await runScenario("health", "Liveness", "GET /health", () =>
            fetch("/health", { headers: { Accept: "application/json" } }),
          );
          break;
        case "ready":
          run = await runScenario("ready", "Readiness", "GET /health/ready", () =>
            fetch("/health/ready", { headers: { Accept: "application/json" } }),
          );
          break;
        case "bad400":
          run = await runScenario(
            "bad400",
            "Validation error",
            "POST /v1/analyze — missing transactionBase64",
            () =>
              fetch("/v1/analyze", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                  Authorization: `Bearer ${effectiveKey()}`,
                },
                body: JSON.stringify({ cluster: "devnet" }),
              }),
          );
          break;
        case "noauth":
          run = await runScenario(
            "noauth",
            "Unauthenticated",
            "POST — no Authorization, valid body",
            async () => {
              const { base64 } = await generateUnsignedDevnetSampleTx();
              return fetch("/v1/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({
                  cluster: "devnet",
                  transactionBase64: base64,
                  policy: {},
                }),
              });
            },
          );
          break;
        case "happy":
          run = await runScenario(
            "happy",
            "Full analyze",
            "POST /v1/analyze + API key + sample tx",
            async () => {
              const key = effectiveKey();
              const { base64 } = await generateUnsignedDevnetSampleTx();
              return fetch("/v1/analyze", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                  Authorization: `Bearer ${key}`,
                },
                body: JSON.stringify({
                  cluster: "devnet",
                  transactionBase64: base64,
                  policy: {},
                }),
              });
            },
          );
          break;
        default:
          return;
      }
      pushRun(run);
    } finally {
      setLoading(null);
    }
  };

  const runAll = async () => {
    for (const id of ["health", "ready", "bad400", "noauth", "happy"]) {
      await runOne(id);
    }
  };

  const active = runs.find((r) => r.runId === selected) ?? runs[0];

  return (
    <div className="mx-auto max-w-7xl flex-1 space-y-8 p-6 md:p-8">
      <header className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-tighter text-primary">
              Lab environment
            </span>
            <span className="font-mono text-xs text-on-surface-variant opacity-60">#DELTAG-JURY</span>
          </div>
          <h1 className="font-headline text-3xl font-bold tracking-tight text-on-surface md:text-4xl">
            Jury lab
          </h1>
          <p className="mt-2 max-w-2xl font-body text-on-surface-variant">
            Run canned requests against the live server. Use <strong className="text-on-surface">402</strong>{" "}
            scenarios when <code className="text-primary/90">X402_ENABLED</code> and auth mode allow payment
            challenges; otherwise expect <strong className="text-on-surface">401</strong> for unauthenticated
            calls.
          </p>
        </div>
        <button
          type="button"
          disabled={loading !== null}
          onClick={runAll}
          className="group flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-bold tracking-tight text-on-primary transition-all hover:shadow-[0_0_20px_rgba(143,245,255,0.3)] active:scale-95 disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-lg transition-transform duration-500 group-hover:rotate-180">
            play_circle
          </span>
          Run all scenarios
        </button>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <section className="flex flex-col gap-6 lg:col-span-4">
          <div className="rounded-xl border-l-2 border-primary/20 bg-surface-container-low p-6">
            <h2 className="mb-6 text-xs font-bold uppercase tracking-[0.2em] text-primary-fixed-dim">
              Execution scenarios
            </h2>
            <div className="flex flex-col gap-3">
              {SCENARIOS.map((s) => {
                const isLoad = loading === s.id;
                const hasBadge = "badge" in s;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={loading !== null}
                    onClick={() => runOne(s.id)}
                    className="w-full text-left"
                  >
                    <div
                      className={`flex items-center justify-between rounded-lg border p-4 transition-all ${
                        hasBadge && s.tone === "error"
                          ? "border-error/20 bg-surface-container-high ring-1 ring-error/10 hover:border-error/40"
                          : hasBadge && s.tone === "tertiary"
                            ? "border-tertiary/20 bg-surface-container-high ring-1 ring-tertiary/10 hover:border-tertiary/40"
                            : hasBadge && s.tone === "primary"
                              ? "border-primary/20 bg-surface-container-high ring-1 ring-primary/10 hover:border-primary/40"
                              : "border-transparent bg-surface-container hover:border-primary/30 hover:bg-surface-variant"
                      } ${isLoad ? "opacity-70" : ""}`}
                    >
                      <div className="flex flex-col">
                        <span className="mb-1 font-mono text-[10px] text-primary/70">{s.method}</span>
                        <span className="font-headline text-sm font-semibold">{s.path}</span>
                        {"hint" in s && s.hint ? (
                          <span className="mt-1 text-[9px] text-on-surface-variant">{s.hint}</span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        {hasBadge ? (
                          <span
                            className={`rounded px-2 py-1 text-[10px] font-bold ${
                              s.tone === "error"
                                ? "bg-error/10 text-error"
                                : s.tone === "tertiary"
                                  ? "bg-tertiary/10 text-tertiary"
                                  : "bg-primary/10 text-primary"
                            }`}
                          >
                            {s.badge}
                          </span>
                        ) : null}
                        <span className="material-symbols-outlined text-on-surface-variant transition-colors group-hover:text-primary">
                          chevron_right
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="space-y-6 lg:col-span-8">
          {active ? (
            <div className="rounded-xl border border-outline-variant/10 bg-surface-container p-6 md:p-8">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <h2 className="font-headline text-xl font-bold text-on-surface">{active.title}</h2>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    active.status === 200
                      ? "bg-primary/15 text-primary"
                      : active.status === 402
                        ? "bg-secondary/15 text-secondary"
                        : active.status === 400 || active.status === 401
                          ? "bg-tertiary/15 text-tertiary"
                          : "bg-error/15 text-error"
                  }`}
                >
                  HTTP {active.status}
                </span>
                <span className="text-sm text-on-surface-variant">{active.durationMs} ms</span>
              </div>
              <p className="text-xs text-on-surface-variant">{active.subtitle}</p>
              <p className="mt-3 text-sm text-on-surface">{active.interpretation}</p>
              <p className="mt-2 text-xs text-on-surface-variant">{active.summary}</p>

              {paymentRelatedHeaders(active.headers).length > 0 ? (
                <div className="mt-6 rounded-lg border border-secondary/30 bg-secondary/5 p-4">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-secondary">
                    Payment / x402 headers
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px]">
                      <tbody>
                        {paymentRelatedHeaders(active.headers).map(([k, v]) => (
                          <tr key={k}>
                            <th className="align-top py-1 pr-3 font-medium text-on-surface-variant">{k}</th>
                            <td className="break-all font-mono text-on-surface">
                              {v.length > 220 ? `${v.slice(0, 220)}…` : v}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              <details className="mt-6" open>
                <summary className="cursor-pointer font-headline text-xs font-bold uppercase tracking-wider text-primary">
                  All response headers
                </summary>
                <div className="custom-scrollbar mt-3 max-h-48 overflow-auto rounded-lg bg-surface-container-low p-3">
                  <table className="w-full text-left text-[11px]">
                    <tbody>
                      {Object.entries(active.headers).map(([k, v]) => (
                        <tr key={k}>
                          <th className="align-top py-1 pr-3 text-on-surface-variant">{k}</th>
                          <td className="break-all font-mono">{v.length > 120 ? `${v.slice(0, 120)}…` : v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>

              <h3 className="mt-6 font-headline text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                Body
              </h3>
              <pre className="custom-scrollbar mt-2 max-h-[min(420px,50vh)] overflow-auto rounded-lg bg-surface-container-lowest p-4 font-mono text-xs text-on-surface">
                {active.bodyJson
                  ? JSON.stringify(active.bodyJson, null, 2)
                  : active.bodyText}
              </pre>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-outline-variant/25 p-10 text-center text-on-surface-variant">
              Run a scenario to inspect responses, timings, and headers.
            </div>
          )}

          {runs.length > 1 ? (
            <div className="rounded-xl bg-surface-container-low p-6">
              <h3 className="mb-3 font-headline text-xs font-bold uppercase tracking-wider text-primary-fixed-dim">
                History ({runs.length})
              </h3>
              <ul className="space-y-2 text-sm">
                {runs.map((r) => (
                  <li key={r.runId}>
                    <button
                      type="button"
                      className="text-left text-primary hover:underline"
                      onClick={() => setSelected(r.runId)}
                    >
                      {r.title}
                    </button>
                    <span className="text-on-surface-variant">
                      {" "}
                      — HTTP {r.status} — {r.durationMs}ms
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
