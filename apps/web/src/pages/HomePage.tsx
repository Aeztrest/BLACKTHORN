import type { RouteId } from "../layout/AppLayout.js";

export function HomePage({ onNavigate }: { onNavigate: (r: RouteId) => void }) {
  return (
    <>
      <section className="relative flex flex-col items-center justify-center overflow-hidden px-6 py-16 md:px-12 md:py-24">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="absolute left-1/2 top-1/4 h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-primary/5 blur-[120px]" />
        </div>
        <div className="relative z-10 max-w-4xl text-center">
          <div className="font-label mb-8 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-surface-container-high px-3 py-1 text-xs uppercase tracking-[0.15em] text-primary">
            <span className="material-symbols-outlined text-sm">security</span>
            Real-time deterministic guardrails
          </div>
          <h1 className="mb-6 font-headline text-4xl font-bold leading-tight tracking-tighter text-on-surface md:text-6xl lg:text-7xl">
            DeltaG — pre-check Solana{" "}
            <span className="bg-gradient-to-r from-primary to-primary-container bg-clip-text text-transparent">
              transactions
            </span>{" "}
            with confidence.
          </h1>
          <p className="mx-auto mb-10 max-w-3xl text-lg font-light leading-relaxed text-on-surface-variant md:text-2xl">
            Simulate → analyze → policy decision. A deterministic engine returns{" "}
            <code className="text-primary/90">safe</code> and machine-readable reasons before you hit the
            network. Optional <strong className="text-on-surface">x402</strong> pay-per-call.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => onNavigate("dev")}
              className="rounded bg-gradient-to-br from-primary to-primary-container px-8 py-4 font-bold text-on-primary-container shadow-lg shadow-primary/20 transition-all hover:scale-105"
            >
              Launch Developer Console
            </button>
            <button
              type="button"
              onClick={() => onNavigate("arch")}
              className="rounded bg-surface-container-highest px-8 py-4 font-medium text-on-surface transition-all hover:bg-surface-bright"
            >
              Read documentation
            </button>
          </div>
        </div>
      </section>

      <section className="px-6 pb-16 md:px-12 md:pb-24">
        <div className="mx-auto grid max-w-6xl auto-rows-[minmax(200px,auto)] grid-cols-1 gap-6 md:grid-cols-12">
          <button
            type="button"
            onClick={() => onNavigate("arch")}
            className="group relative flex flex-col overflow-hidden rounded-xl bg-surface-container p-8 text-left transition-all hover:bg-surface-container-high md:col-span-8"
          >
            <div className="absolute right-0 top-0 h-full w-64 opacity-30">
              <div className="h-full w-full bg-gradient-to-br from-primary/20 to-transparent" />
            </div>
            <div className="relative z-10 flex h-full flex-col">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <span className="material-symbols-outlined text-2xl text-primary">account_tree</span>
              </div>
              <h3 className="mb-2 font-headline text-2xl font-bold text-on-surface">Architecture</h3>
              <p className="max-w-md text-on-surface-variant">
                Deployment topology, request sequence, analysis pipeline, and component dictionary — with live
                Mermaid diagrams.
              </p>
              <span className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-bold tracking-wider text-primary transition-all hover:gap-3">
                EXPLORE INFRASTRUCTURE
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate("scan")}
            className="flex flex-col rounded-xl bg-surface-container p-8 text-left transition-all hover:bg-surface-container-high md:col-span-4"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-error/10">
              <span className="material-symbols-outlined text-2xl text-error">health_and_safety</span>
            </div>
            <h3 className="mb-2 font-headline text-2xl font-bold text-on-surface">Security scan</h3>
            <p className="text-sm text-on-surface-variant">
              Paste a VersionedTransaction (base64), pick cluster, call{" "}
              <code className="text-primary/80">POST /v1/analyze</code>.
            </p>
            <div className="mt-auto border-l-2 border-primary/40 bg-surface-container-lowest p-3 font-mono text-[10px] text-primary/80">
              {`{ "safe": boolean, "reasons": [] }`}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate("jury")}
            className="flex flex-col rounded-xl border border-transparent bg-surface-container p-8 text-left transition-all hover:border-outline-variant/30 hover:bg-surface-container-high md:col-span-4"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-tertiary/10">
              <span className="material-symbols-outlined text-2xl text-tertiary">science</span>
            </div>
            <h3 className="mb-2 font-headline text-2xl font-bold text-on-surface">Jury lab</h3>
            <p className="text-sm text-on-surface-variant">
              One-click scenarios against the live API: health, validation errors, auth, and x402{" "}
              <code className="text-error/90">402</code> discovery.
            </p>
          </button>

          <div className="flex flex-col items-center gap-8 rounded-xl border border-primary/10 bg-[#000000] p-8 transition-all group md:col-span-8 md:flex-row">
            <div className="flex-1">
              <div className="mb-4 inline-flex rounded bg-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
                Protocol
              </div>
              <h3 className="mb-4 font-headline text-2xl font-bold text-on-surface">x402 facilitator</h3>
              <p className="text-lg text-on-surface-variant">
                When enabled server-side, callers without payment may receive HTTP 402 with facilitator headers;
                the lab page surfaces those headers for inspection.
              </p>
            </div>
            <div className="relative flex h-32 w-32 flex-shrink-0 items-center justify-center">
              <div className="absolute inset-0 animate-spin-slow rounded-full border-2 border-dashed border-primary/30" />
              <div className="absolute inset-2 flex items-center justify-center rounded-full bg-primary/5">
                <span
                  className="material-symbols-outlined text-4xl text-primary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  payments
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-16 md:px-12 md:pb-24">
        <div className="glass-panel relative mx-auto flex max-w-6xl flex-col items-center gap-12 overflow-hidden rounded-2xl p-8 lg:flex-row lg:p-12">
          <div className="pointer-events-none absolute bottom-0 right-0 opacity-5">
            <span className="material-symbols-outlined text-[12rem]" style={{ fontVariationSettings: "'wght' 100" }}>
              terminal
            </span>
          </div>
          <div className="relative flex-1">
            <h2 className="mb-6 font-headline text-3xl font-bold text-on-surface md:text-4xl">
              Developer console
            </h2>
            <p className="mb-8 max-w-2xl text-lg text-on-surface-variant">
              Full <code className="text-primary/90">/v1/analyze</code> body editor: cluster, base64 tx, optional{" "}
              <code className="text-primary/90">userWallet</code>, <code className="text-primary/90">policy</code>{" "}
              flags, and raw JSON mode. Health checks included.
            </p>
            <div className="flex flex-wrap gap-4">
              <button
                type="button"
                onClick={() => onNavigate("dev")}
                className="group flex cursor-pointer items-center gap-4 rounded-lg border border-outline-variant/15 bg-surface-container-lowest px-6 py-4 transition-colors hover:border-primary/40"
              >
                <span className="material-symbols-outlined text-primary">add_circle</span>
                <div className="text-left">
                  <div className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
                    Open tool
                  </div>
                  <div className="text-sm font-bold text-on-surface">Developer console</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => onNavigate("scan")}
                className="group flex cursor-pointer items-center gap-4 rounded-lg border border-outline-variant/15 bg-surface-container-lowest px-6 py-4 transition-colors hover:border-primary/40"
              >
                <span className="material-symbols-outlined text-primary">monitoring</span>
                <div className="text-left">
                  <div className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
                    End-user flow
                  </div>
                  <div className="text-sm font-bold text-on-surface">Security scan</div>
                </div>
              </button>
            </div>
          </div>
          <div className="relative z-10 flex h-[280px] w-full flex-col overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container-lowest shadow-2xl lg:h-[300px] lg:w-[400px]">
            <div className="flex h-8 items-center gap-1.5 bg-surface-container-high px-4">
              <div className="h-2.5 w-2.5 rounded-full bg-error/40" />
              <div className="h-2.5 w-2.5 rounded-full bg-tertiary/40" />
              <div className="h-2.5 w-2.5 rounded-full bg-primary/40" />
            </div>
            <div className="custom-scrollbar flex-1 overflow-auto p-6 font-mono text-[11px] leading-relaxed text-on-surface-variant">
              <div className="mb-2 flex gap-4">
                <span className="text-primary-dim">POST</span>
                <span className="text-on-surface">/v1/analyze</span>
              </div>
              <div className="text-secondary-fixed-dim">{"{"}</div>
              <div className="pl-4">
                <span className="text-primary-dim">&quot;cluster&quot;</span>
                <span className="text-on-surface">: </span>
                <span className="text-secondary">&quot;devnet&quot;</span>
                <span className="text-on-surface">,</span>
              </div>
              <div className="pl-4">
                <span className="text-primary-dim">&quot;transactionBase64&quot;</span>
                <span className="text-on-surface">: </span>
                <span className="text-secondary">&quot;…&quot;</span>
                <span className="text-on-surface">,</span>
              </div>
              <div className="pl-4">
                <span className="text-primary-dim">&quot;policy&quot;</span>
                <span className="text-on-surface">: {"{}"}</span>
              </div>
              <div className="text-secondary-fixed-dim">{"}"}</div>
              <div className="mt-4 text-primary-dim">// 200 + Zod-validated decision JSON</div>
              <div className="text-tertiary-dim">
                {`{ "safe": true, "reasons": ["…"], "riskFindings": [] }`}
              </div>
            </div>
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={() => onNavigate("dev")}
        className="fixed bottom-8 right-8 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary-container shadow-[0_0_20px_rgba(143,245,255,0.4)] transition-all hover:scale-110 active:scale-95"
        aria-label="Open developer console"
      >
        <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
          terminal
        </span>
      </button>
    </>
  );
}
