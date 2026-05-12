/**
 * Compact AnalysisReport for the popup.
 * Renders an AnalyzeResponse — the BLACKTHORN simulation verdict + findings
 * + balance changes — into a 360-wide column.
 *
 * Spec: docs/wallet-spec.md §8 (sign request) + docs/brand.md §3.3 (severity).
 */

import { useState } from "react";
import { ShieldCheck, ShieldX, AlertTriangle, ChevronDown, Info, ArrowRight } from "lucide-react";
import type { AnalyzeResponse, RiskFindingPayload } from "@blackthorn/ext-protocol";

const SEVERITY_TONE: Record<RiskFindingPayload["severity"], { dot: string; bg: string; border: string; text: string }> = {
  low:      { dot: "bg-text-faint", bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.08)", text: "var(--text-faint)" },
  medium:   { dot: "bg-warn",       bg: "rgba(251,191,36,0.07)",  border: "rgba(251,191,36,0.25)",  text: "var(--warn)" },
  high:     { dot: "bg-bad",        bg: "rgba(248,113,113,0.07)", border: "rgba(248,113,113,0.30)", text: "var(--bad)" },
  critical: { dot: "bg-bad",        bg: "rgba(248,113,113,0.09)", border: "rgba(248,113,113,0.35)", text: "var(--bad)" },
};

export function AnalysisReport({ result }: { result: AnalyzeResponse }) {
  const findings = result.riskFindings ?? [];
  const reasons = result.reasons ?? [];
  const changes = result.estimatedChanges;
  const significantSol = changes.sol.filter((s) => s.deltaLamports !== null && s.deltaLamports !== 0);

  return (
    <div className="space-y-3">
      <Hero result={result} reasons={reasons} />

      {(significantSol.length > 0 || changes.tokens.length > 0 || changes.approvals.length > 0) && (
        <Section label="What changes">
          <div className="space-y-1">
            {significantSol.map((s, i) => (
              <DeltaRow
                key={`sol-${i}`}
                label={shortAddr(s.account)}
                value={`${s.deltaLamports! < 0 ? "" : "+"}${(s.deltaLamports! / 1e9).toFixed(6)} SOL`}
                negative={s.deltaLamports! < 0}
              />
            ))}
            {changes.tokens.map((t, i) => (
              <DeltaRow
                key={`tok-${i}`}
                label={t.symbol ?? shortAddr(t.mint)}
                value={t.deltaAmount ?? "—"}
                negative={t.deltaAmount?.startsWith("-")}
              />
            ))}
            {changes.approvals.map((a, i) => (
              <DeltaRow
                key={`apv-${i}`}
                label={`Approval → ${shortAddr(a.delegate)}`}
                value={a.amount ?? "unlimited"}
                tone="warn"
              />
            ))}
          </div>
        </Section>
      )}

      {findings.length > 0 && (
        <Section label={`Findings (${findings.length})`}>
          <div className="space-y-1.5">
            {findings.map((f, i) => <FindingRow key={i} finding={f} />)}
          </div>
        </Section>
      )}

      {result.simulationWarnings && result.simulationWarnings.length > 0 && (
        <Section label="Simulation logs">
          <ul className="space-y-0.5 text-[10px] font-mono text-text-faint">
            {result.simulationWarnings.slice(0, 6).map((w, i) => <li key={i} className="break-all">{w}</li>)}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Hero({ result, reasons }: { result: AnalyzeResponse; reasons: string[] }) {
  const tone = result.decision === "block" ? "bad" : result.decision === "advisory" ? "warn" : "ok";
  const Icon = result.decision === "block" ? ShieldX : result.decision === "advisory" ? AlertTriangle : ShieldCheck;
  const heading =
    result.decision === "block"    ? "Blocked by your policy" :
    result.decision === "advisory" ? (result.offline ? "Sim unavailable" : "Sign with caution") :
                                      "Safe to sign";

  return (
    <div
      className="rounded-card p-3.5 flex gap-3"
      style={{
        background: tone === "bad"  ? "rgba(248,113,113,0.06)"
                  : tone === "warn" ? "rgba(251,191,36,0.06)"
                  :                   "rgba(52,211,153,0.06)",
        border: tone === "bad"  ? "1px solid rgba(248,113,113,0.25)"
              : tone === "warn" ? "1px solid rgba(251,191,36,0.25)"
              :                   "1px solid rgba(52,211,153,0.25)",
      }}
    >
      <Icon size={20} className={tone === "bad" ? "text-bad shrink-0 mt-0.5" : tone === "warn" ? "text-warn shrink-0 mt-0.5" : "text-ok shrink-0 mt-0.5"} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold ${tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ok"}`}>{heading}</p>
        {reasons.length > 0 && (
          <ul className="text-[11px] text-text-muted mt-1 space-y-0.5">
            {reasons.slice(0, 3).map((r, i) => (
              <li key={i} className="flex gap-1.5 leading-relaxed">
                <Info size={9} className="text-text-faint mt-1 shrink-0" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="card !p-3 space-y-2">
      <button
        onClick={() => setOpen((s) => !s)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="label !mb-0">{label}</span>
        <ChevronDown size={11} className={`text-text-faint transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && children}
    </div>
  );
}

function DeltaRow({ label, value, negative, tone }: {
  label: string; value: string; negative?: boolean; tone?: "warn" | "bad";
}) {
  const colorClass = tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : negative ? "text-bad" : "text-ok";
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="font-mono text-text-muted truncate">{label}</span>
      <span className={`font-mono shrink-0 ${colorClass}`}>{value}</span>
    </div>
  );
}

function FindingRow({ finding }: { finding: RiskFindingPayload }) {
  const tone = SEVERITY_TONE[finding.severity];
  return (
    <div className="rounded-input px-2.5 py-2 flex items-start gap-2"
         style={{ background: tone.bg, border: `1px solid ${tone.border}` }}>
      <span className={`w-1.5 h-1.5 rounded-pill mt-1 shrink-0 ${tone.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-mono text-[10px] font-semibold" style={{ color: tone.text }}>
            {finding.code}
          </span>
          <span className="text-[9px] uppercase tracking-wider font-bold px-1 py-px rounded"
                style={{ background: tone.border, color: tone.text }}>
            {finding.severity}
          </span>
        </div>
        <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">{finding.message}</p>
      </div>
    </div>
  );
}

function shortAddr(s: string): string {
  if (s.length < 12) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export { ArrowRight };
