import { MermaidBlock } from "../components/MermaidBlock.js";

const DIAG_DEPLOY = `
flowchart TB
  subgraph client["Browser"]
    UI["React demo UI"]
  end
  subgraph edge["Edge"]
    NX["Nginx<br/>static + proxy"]
  end
  subgraph api["API container"]
    FY["Fastify"]
    RL["Rate limit"]
    AUTH["API key"]
    X402["x402 preHandler"]
    RT["POST /v1/analyze"]
  end
  subgraph chain["External"]
    RPC["Solana RPC"]
    FAC["x402 facilitator"]
  end
  UI -->|"GET/POST /"| NX
  NX -->|"proxy /v1 /health"| FY
  FY --> RL
  RL --> AUTH
  AUTH --> X402
  X402 --> RT
  RT --> RPC
  RT --> FAC
`;

const DIAG_ANALYZE_SEQ = `
sequenceDiagram
  participant C as Client
  participant F as Fastify
  participant X as x402
  participant A as Analyze
  participant R as Solana RPC
  participant P as Policy engine
  C->>F: POST /v1/analyze + body
  F->>F: Rate limit, API key
  F->>X: Payment verify (if enabled)
  alt Missing / invalid payment
    X-->>C: 402 or error
  end
  X->>A: Continue
  A->>R: getMultipleAccounts + simulate
  R-->>A: Accounts + sim result
  A->>P: Risk + rules
  P-->>A: Decision JSON
  A->>A: Zod validate response
  A->>X: Settlement (if x402)
  A-->>C: 200 + safe/reasons
`;

const DIAG_PIPELINE = `
flowchart TB
  IN["Base64 VersionedTransaction"]
  D["Decode"]
  K["Static account keys"]
  PF["Pre-fetch accounts"]
  SIM["simulateTransaction"]
  NORM["Normalize"]
  DEL["Delta extraction"]
  RISK["Risk findings"]
  POL["Policy engine"]
  OUT["Decision JSON"]
  IN --> D --> K --> PF --> SIM --> NORM --> DEL --> RISK --> POL --> OUT
`;

const MODULE_ROWS: { module: string; tech: string }[] = [
  { module: "Web server", tech: "Fastify" },
  { module: "Validation", tech: "Zod" },
  { module: "Solana client", tech: "@solana/web3.js" },
  { module: "Simulation", tech: "RPC simulate + normalize" },
  { module: "Logic", tech: "Risk + policy engine" },
  { module: "Optional paywall", tech: "x402 (@x402/core)" },
  { module: "Edge (Docker web)", tech: "Nginx" },
  { module: "Runtime", tech: "Docker Compose" },
];

export function ArchitecturePage() {
  return (
    <div className="mx-auto max-w-6xl p-6 md:p-12">
      <header className="mb-12">
        <h1 className="mb-4 font-headline text-4xl font-bold tracking-tighter text-on-surface md:text-5xl">
          Architecture &amp; workflow
        </h1>
        <p className="max-w-2xl text-lg text-on-surface-variant">
          How the demo is deployed, how a request moves through Fastify, and how analysis is pipelined before a
          schema-validated JSON response is returned.
        </p>
      </header>

      <section className="mb-16">
        <div className="mb-8 flex items-center gap-3">
          <span className="h-[1px] w-8 bg-primary" />
          <h2 className="font-headline text-2xl font-bold tracking-tight text-primary">Deployment workflow</h2>
        </div>
        <p className="mb-6 max-w-3xl text-on-surface-variant">
          Browser loads static assets from Nginx; <code className="text-primary/90">/v1</code> and{" "}
          <code className="text-primary/90">/health</code> reverse-proxy to the API container (same origin, no
          CORS friction).
        </p>
        <div className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-4">
          {(
            [
              ["Entry", "devices", "Client"],
              ["Proxy", "dns", "Nginx"],
              ["Core API", "bolt", "Fastify"],
              ["Chain", "hub", "Solana RPC"],
            ] as const
          ).map(([label, icon, title], i) => (
            <div
              key={label}
              className={`relative z-10 rounded-xl border border-outline-variant/10 bg-surface-container p-6 transition-all hover:border-primary/30 ${
                i === 2 ? "border-primary/20 shadow-[0_0_20px_rgba(143,245,255,0.05)]" : ""
              }`}
            >
              <div className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
                {label}
              </div>
              <div className="flex flex-col items-center gap-4">
                <span className="material-symbols-outlined text-4xl text-primary">{icon}</span>
                <span className="font-headline text-lg font-bold">{title}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-4 md:p-6">
          <MermaidBlock chart={DIAG_DEPLOY} caption="Docker-style topology (conceptual)" />
        </div>
      </section>

      <section className="mb-16">
        <div className="mb-8 flex items-center gap-3">
          <span className="h-[1px] w-8 bg-primary" />
          <h2 className="font-headline text-2xl font-bold tracking-tight text-primary">Request sequence</h2>
        </div>
        <div className="mb-8 overflow-hidden rounded-2xl bg-surface-container-low">
          <div className="grid grid-cols-2 border-b border-outline-variant/10 sm:grid-cols-4 lg:grid-cols-7">
            {(
              [
                "Rate limit",
                "API key",
                "x402",
                "Analyze",
                "RPC",
                "Policy",
                "Response",
              ] as const
            ).map((step, idx) => (
              <div
                key={step}
                className={`border-b border-outline-variant/10 p-4 text-center last:border-b-0 sm:border-b-0 lg:border-r lg:last:border-r-0 ${
                  idx % 2 === 0 ? "bg-surface-container-highest/20" : ""
                } ${idx === 6 ? "bg-primary/10" : ""}`}
              >
                <div className="mb-2 text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">
                  Step {String(idx + 1).padStart(2, "0")}
                </div>
                <div
                  className={`font-headline text-sm font-bold ${idx === 2 ? "text-tertiary" : ""} ${idx === 6 ? "text-primary" : ""}`}
                >
                  {step}
                </div>
              </div>
            ))}
          </div>
          <div className="p-6 md:p-10">
            <MermaidBlock chart={DIAG_ANALYZE_SEQ} caption="End-to-end message flow (summary)" />
          </div>
        </div>
      </section>

      <div className="mb-16 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <div className="flex items-center gap-3">
            <span className="h-[1px] w-8 bg-primary" />
            <h2 className="font-headline text-2xl font-bold tracking-tight text-primary">Analysis pipeline</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-outline-variant/10 bg-surface-container p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">data_object</span>
                <h4 className="font-headline font-bold">TX decode</h4>
              </div>
              <p className="text-xs leading-relaxed text-on-surface-variant">
                VersionedTransaction wire bytes from base64; static account keys extracted.
              </p>
            </div>
            <div className="rounded-xl border border-outline-variant/10 bg-surface-container p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">cloud_download</span>
                <h4 className="font-headline font-bold">Pre-fetch</h4>
              </div>
              <p className="text-xs leading-relaxed text-on-surface-variant">
                Bounded <code className="text-primary/80">getMultipleAccounts</code> before simulation.
              </p>
            </div>
            <div className="rounded-xl border border-primary/10 bg-surface-container-high p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">model_training</span>
                <h4 className="font-headline font-bold">Simulate</h4>
              </div>
              <p className="text-xs leading-relaxed text-on-surface-variant">
                <code className="text-primary/80">simulateTransaction</code> with{" "}
                <code className="text-primary/80">sigVerify: false</code> for unsigned demo txs.
              </p>
            </div>
            <div className="rounded-xl border border-outline-variant/10 bg-surface-container p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">straighten</span>
                <h4 className="font-headline font-bold">Normalize</h4>
              </div>
              <p className="text-xs leading-relaxed text-on-surface-variant">
                RPC-specific shapes mapped to an internal normalized simulation model.
              </p>
            </div>
            <div className="col-span-2 border-l-2 border-primary bg-surface-container-lowest p-8">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h4 className="mb-2 font-headline text-lg font-bold text-primary">Deltas + risk + policy</h4>
                  <p className="text-sm text-on-surface-variant">
                    Heuristic SOL/SPL deltas, risk detectors, deterministic policy →{" "}
                    <code className="text-primary/80">safe</code> + reasons.
                  </p>
                </div>
                <span className="material-symbols-outlined text-3xl text-primary">analytics</span>
              </div>
              <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-4">
                <MermaidBlock chart={DIAG_PIPELINE} caption="Server-side pipeline" />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <span className="h-[1px] w-8 bg-primary" />
            <h2 className="font-headline text-2xl font-bold tracking-tight text-primary">Module map</h2>
          </div>
          <div className="rounded-2xl border border-outline-variant/10 bg-surface-container p-2">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-outline-variant/10 text-[10px] uppercase tracking-widest text-on-surface-variant">
                <tr>
                  <th className="p-4 font-bold">Module</th>
                  <th className="p-4 font-bold">Technology</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {MODULE_ROWS.map((row) => (
                  <tr
                    key={row.module}
                    className="transition-colors hover:bg-surface-container-high"
                  >
                    <td className="p-4 font-bold text-on-surface">{row.module}</td>
                    <td className="p-4 font-mono text-xs text-primary/80">{row.tech}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <section className="max-w-4xl">
        <div className="mb-8 flex items-center gap-3">
          <span className="h-[1px] w-8 bg-error" />
          <h2 className="font-headline text-2xl font-bold tracking-tight text-error">System limitations</h2>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-xl border-t border-error/20 bg-surface-container-low p-6">
            <h5 className="mb-2 font-headline font-bold">Simulate ≠ execution</h5>
            <p className="text-xs leading-relaxed text-on-surface-variant">
              Snapshot simulation can diverge from final on-chain execution.
            </p>
          </div>
          <div className="rounded-xl border-t border-error/20 bg-surface-container-low p-6">
            <h5 className="mb-2 font-headline font-bold">Account limits</h5>
            <p className="text-xs leading-relaxed text-on-surface-variant">
              Large account sets may be truncated or rejected; see server docs.
            </p>
          </div>
          <div className="rounded-xl border-t border-error/20 bg-surface-container-low p-6">
            <h5 className="mb-2 font-headline font-bold">x402 optionality</h5>
            <p className="text-xs leading-relaxed text-on-surface-variant">
              Payment flow requires facilitator + wallet; demo UI does not sign payments.
            </p>
          </div>
        </div>
        <p className="mt-6 text-sm text-on-surface-variant">
          Full list: <code className="text-primary/90">LIMITATIONS.md</code> in the repository root.
        </p>
      </section>
    </div>
  );
}
