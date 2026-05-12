/**
 * Policies editor — production policy DSL UI for BLACKTHORN.
 *
 * Three modes:
 *  1. Templates    — one-click pick Strict / Balanced / Permissive.
 *  2. Toggles      — every boolean + numeric policy field, grouped by domain.
 *  3. Raw JSON     — copy-paste for power users.
 *
 * Every change writes through `policy.write`, which validates via the shared
 * `validatePolicy` from @blackthorn/swig-guard and persists to browser.storage.
 * The popup's sign-time analyze pipeline reads policy.read on every signature,
 * so changes take effect immediately on the next signing request.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileCode, Save, RotateCcw, Loader2, Check, AlertTriangle, ShieldX, Code } from "lucide-react";
import {
  BALANCED_POLICY, STRICT_POLICY, PERMISSIVE_POLICY, POLICY_TEMPLATES,
  type GuardPolicy,
} from "@blackthorn/swig-guard";
import { useRpc } from "../../shared/state-context";

type Mode = "form" | "json";

export function PoliciesPage() {
  const rpc = useRpc();
  const [saved, setSaved] = useState<GuardPolicy | null>(null);
  const [draft, setDraft] = useState<GuardPolicy | null>(null);
  const [mode, setMode] = useState<Mode>("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = (await rpc.call("policy.read", undefined as never)) as GuardPolicy;
      setSaved(p);
      setDraft(p);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [rpc]);

  useEffect(() => { void load(); }, [load]);

  const dirty = useMemo(() => {
    if (!saved || !draft) return false;
    return JSON.stringify(saved) !== JSON.stringify(draft);
  }, [saved, draft]);

  const save = async () => {
    if (!draft) return;
    setBusy(true); setError(null); setSuccess(false);
    try {
      await rpc.call("policy.write", { policy: draft });
      setSaved(draft);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setDraft(saved); setError(null); setSuccess(false); };

  const applyTemplate = (preset: GuardPolicy) => {
    setDraft({ ...preset });
  };

  const set = useCallback(<K extends keyof GuardPolicy>(key: K, value: GuardPolicy[K]) => {
    setDraft((prev) => prev ? { ...prev, [key]: value } : prev);
  }, []);

  if (!draft) {
    return <div className="flex items-center gap-2 text-text-faint"><Loader2 size={14} className="animate-spin" /> Loading policy…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Policies</h1>
        <p className="text-text-muted text-sm mt-1">
          The rules BLACKTHORN runs on every signature. Changes take effect on the next request.
        </p>
      </div>

      {/* Templates */}
      <section className="card space-y-3">
        <div className="flex items-center gap-2">
          <FileCode size={14} className="text-text" />
          <h2 className="font-bold text-sm">Quick presets</h2>
        </div>
        <p className="text-text-faint text-xs leading-relaxed">
          Three pre-curated policies for different risk appetites. You can still tweak every field below after picking one.
        </p>
        <div className="grid sm:grid-cols-3 gap-2">
          {POLICY_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => applyTemplate(t.policy)}
              className="text-left p-3 rounded-input hover:bg-white/[0.04] transition-colors"
              style={{ background: "rgba(255,255,255,0.025)", border: "1px solid var(--line)" }}
            >
              <p className="font-bold text-sm">{t.name}</p>
              <p className="text-text-faint text-[11px] mt-1 leading-snug">{t.description}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Mode tabs */}
      <div className="flex gap-2">
        <ModeTab active={mode === "form"} onClick={() => setMode("form")} icon={ShieldX}>Toggles</ModeTab>
        <ModeTab active={mode === "json"} onClick={() => setMode("json")} icon={Code}>Raw JSON</ModeTab>
      </div>

      {mode === "form" && <FormEditor draft={draft} set={set} />}
      {mode === "json" && <JsonEditor draft={draft} setDraft={setDraft} />}

      {/* Status + actions */}
      {error && (
        <div className="card !p-3 flex items-start gap-2" style={{ background: "var(--bad-dim)" }}>
          <AlertTriangle size={14} className="text-bad shrink-0 mt-0.5" />
          <p className="text-bad text-xs">{error}</p>
        </div>
      )}

      <div className="sticky bottom-4 flex justify-end gap-2">
        {dirty && (
          <span className="self-center text-text-faint text-xs mr-auto">Unsaved changes</span>
        )}
        {success && !dirty && (
          <span className="self-center text-ok text-xs mr-auto flex items-center gap-1"><Check size={11} /> Saved</span>
        )}
        <button onClick={reset} disabled={!dirty || busy} className="btn-ghost">
          <RotateCcw size={13} /> Reset
        </button>
        <button onClick={save} disabled={!dirty || busy} className="btn-primary">
          {busy ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : <><Save size={13} /> Save policy</>}
        </button>
      </div>
    </div>
  );
}

function ModeTab({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: typeof FileCode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-input text-xs font-semibold"
      style={{
        background: active ? "rgba(255,255,255,0.06)" : "transparent",
        border: `1px solid ${active ? "rgba(255,255,255,0.12)" : "var(--line)"}`,
        color: active ? "var(--text)" : "var(--text-faint)",
      }}
    >
      <Icon size={11} /> {children}
    </button>
  );
}

/* ─────────── Form editor ─────────── */

function FormEditor({ draft, set }: { draft: GuardPolicy; set: <K extends keyof GuardPolicy>(k: K, v: GuardPolicy[K]) => void }) {
  return (
    <div className="space-y-4">
      <Group title="Pre-sign rules" subtitle="Run on every transaction before you sign.">
        <NumberField label="Max loss per tx (%)"  hint="Block when estimated SOL/USDC loss exceeds this % of wallet balance."
          value={draft.maxLossPercent} onChange={(v) => set("maxLossPercent", v)} min={0} max={100} suffix="%" />
        <NumberField label="Min post-tx USDC balance" hint="Refuse if your USDC balance after the tx falls below this floor."
          value={draft.minPostUsdcBalance} onChange={(v) => set("minPostUsdcBalance", v)} min={0} suffix="USDC" />
        <BoolField label="Block new SPL token approvals" hint="The classic drainer vector."
          value={draft.blockApprovalChanges} onChange={(v) => set("blockApprovalChanges", v)} />
        <BoolField label="Block delegate changes" hint="Refuse when an existing token delegate is replaced."
          value={draft.blockDelegateChanges} onChange={(v) => set("blockDelegateChanges", v)} />
        <BoolField label="Block risky programs" hint="Reputation-flagged program IDs."
          value={draft.blockRiskyPrograms} onChange={(v) => set("blockRiskyPrograms", v)} />
        <BoolField label="Block unknown programs"
          hint="Reject ANY program not on the known-safe list. Very strict."
          value={draft.blockUnknownProgramExposure} onChange={(v) => set("blockUnknownProgramExposure", v)} />
        <BoolField label="Require successful simulation" hint="Refuse if the pre-sign simulation fails."
          value={draft.requireSuccessfulSimulation !== false}
          onChange={(v) => set("requireSuccessfulSimulation", v)} />
        <BoolField label="Allow medium-severity warnings" hint="Off = even mid warnings block."
          value={draft.allowWarnings} onChange={(v) => set("allowWarnings", v)} />
      </Group>

      <Group title="x402 rules" subtitle="HTTP 402 paywall payments — rolling caps + facilitator checks.">
        <NumberField label="Max per single x402 tx" suffix="USDC"
          value={draft.maxX402PerTx} onChange={(v) => set("maxX402PerTx", v)} min={0} step={0.001} />
        <NumberField label="Hourly cap" suffix="USDC"
          value={draft.x402HourlyCap} onChange={(v) => set("x402HourlyCap", v)} min={0} step={0.01} />
        <NumberField label="Daily cap" suffix="USDC"
          value={draft.x402DailyCap} onChange={(v) => set("x402DailyCap", v)} min={0} step={0.01} />
        <BoolField label="Require Memo instruction" hint="Spec-compliant x402 payments include a memo."
          value={draft.requireMemo} onChange={(v) => set("requireMemo", v)} />
        <BoolField label="Cross-check facilitator signer" hint="Verify the feePayer matches the facilitator's published key."
          value={draft.requireFeePayerSupportedCheck} onChange={(v) => set("requireFeePayerSupportedCheck", v)} />
        <BoolField label="Block amount anomalies"
          hint="Refuse payments far outside this merchant's running mean."
          value={draft.blockAmountAnomalies} onChange={(v) => set("blockAmountAnomalies", v)} />
        <NumberField label="Anomaly threshold (std dev)" hint="Default 4. Higher = looser."
          value={draft.anomalyStdDev} onChange={(v) => set("anomalyStdDev", v)} min={1} step={0.5} />
      </Group>

      <Group title="Allowances" subtitle="Per-merchant Swig sub-key rules.">
        <NumberField label="Auto-revoke idle days" hint="0 = never auto-revoke."
          value={draft.autoRevokeAfterIdleDays} onChange={(v) => set("autoRevokeAfterIdleDays", v)} min={0} suffix="days" />
        <BoolField label="Auto-pause on daily cap" hint="When a merchant hits 100% of its daily cap, pause until you unpause."
          value={draft.autoPauseOnDailyCapHit} onChange={(v) => set("autoPauseOnDailyCapHit", v)} />
        <NumberField label="Max active sub-keys" hint="0 = no limit."
          value={draft.maxActiveSubKeys} onChange={(v) => set("maxActiveSubKeys", v)} min={0} />
        <BoolField label="Refuse unlimited approvals"
          hint="Always cap SPL Token Approve at a finite amount."
          value={draft.refuseUnlimitedApprovals} onChange={(v) => set("refuseUnlimitedApprovals", v)} />
      </Group>

      <Group title="Behavioral alerts" subtitle="Post-sign monitoring.">
        <BoolField label="Drift alerts" hint="Alert when a tx is signed without going through BLACKTHORN."
          value={draft.driftAlerts} onChange={(v) => set("driftAlerts", v)} />
        <BoolField label="Verify-orphan alerts" hint="x402 verify request but no settle in window."
          value={draft.verifyOrphanAlerts} onChange={(v) => set("verifyOrphanAlerts", v)} />
        <BoolField label="No-delivery alerts" hint="Settled x402 but resource didn't arrive."
          value={draft.noDeliveryAlerts} onChange={(v) => set("noDeliveryAlerts", v)} />
        <BoolField label="Refuse while in alert state" hint="Block signing while a related alert is open."
          value={draft.refuseInAlertState} onChange={(v) => set("refuseInAlertState", v)} />
      </Group>
    </div>
  );
}

function Group({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-2.5">
      <div>
        <h3 className="font-bold text-sm">{title}</h3>
        <p className="text-text-faint text-xs">{subtitle}</p>
      </div>
      <div className="space-y-2 pt-1">{children}</div>
    </section>
  );
}

function BoolField({ label, hint, value, onChange }: { label: string; hint: string; value: boolean | undefined; onChange: (v: boolean) => void }) {
  const on = !!value;
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        <p className="text-text-faint text-[11px] mt-0.5 leading-snug">{hint}</p>
      </div>
      <button
        onClick={() => onChange(!on)}
        role="switch"
        aria-checked={on}
        className="relative w-10 h-6 rounded-full transition-colors shrink-0 mt-0.5"
        style={{ background: on ? "var(--accent)" : "rgba(255,255,255,0.10)" }}
      >
        <span
          className="absolute top-0.5 transition-all rounded-full"
          style={{
            left: on ? "calc(100% - 22px)" : "2px",
            width: "20px", height: "20px",
            background: on ? "#000" : "var(--text)",
          }}
        />
      </button>
    </div>
  );
}

function NumberField({ label, hint, value, onChange, min, max, step, suffix }: {
  label: string; hint?: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number; max?: number; step?: number; suffix?: string;
}) {
  const display = value === undefined ? "" : String(value);
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="min-w-0 flex-1">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-text-faint text-[11px] mt-0.5 leading-snug">{hint}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number"
          inputMode="decimal"
          min={min} max={max} step={step ?? "any"}
          value={display}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") onChange(undefined);
            else {
              const n = Number(raw);
              if (Number.isFinite(n)) onChange(n);
            }
          }}
          className="input !w-28 !py-1.5 !text-right text-xs"
        />
        {suffix && <span className="text-[11px] text-text-faint w-10">{suffix}</span>}
      </div>
    </div>
  );
}

/* ─────────── JSON editor ─────────── */

function JsonEditor({ draft, setDraft }: { draft: GuardPolicy; setDraft: (p: GuardPolicy) => void }) {
  const [text, setText] = useState(() => JSON.stringify(draft, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    // Re-sync if a template was applied externally
    setText(JSON.stringify(draft, null, 2));
  }, [draft]);

  return (
    <section className="card space-y-2">
      <p className="text-text-faint text-xs">
        Edit the policy as raw JSON. Click anywhere outside to apply — validation happens on Save.
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          try {
            const parsed = JSON.parse(next) as GuardPolicy;
            setDraft(parsed);
            setParseError(null);
          } catch (err) {
            setParseError(err instanceof Error ? err.message : String(err));
          }
        }}
        spellCheck={false}
        className="w-full font-mono text-[11px] p-3 rounded-input outline-none"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: `1px solid ${parseError ? "var(--bad)" : "var(--line)"}`,
          minHeight: "320px",
          color: "var(--text)",
        }}
      />
      {parseError && <p className="text-bad text-[11px]">JSON error: {parseError}</p>}
    </section>
  );
}

// Surface the templates so other files can reference them without importing the package.
export const TEMPLATES = { STRICT_POLICY, BALANCED_POLICY, PERMISSIVE_POLICY };
